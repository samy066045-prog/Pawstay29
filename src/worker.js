// PawStay – Cloudflare Workers version of server.js
// Same API as the Express server, but runs on Workers + D1 (SQLite) and serves /public as static assets.
import { Hono } from 'hono';

const app = new Hono();
const enc = new TextEncoder(), dec = new TextDecoder();

// ---------- per-isolate state (filled from env on first request) ----------
let D1, SECRET, ready;

// ---------- D1 wrapper: same db.query() shape as server.js ----------
const db = {
  async query(sql, params = []) {
    let i = 0; const out = [];
    sql = sql.replace(/\?/g, () => {
      const p = params[i++];
      if (Array.isArray(p)) { out.push(...p); return p.map(() => '?').join(','); }
      out.push(p === undefined ? null : typeof p === 'boolean' ? +p : p); return '?';
    });
    const st = D1.prepare(sql).bind(...out);
    if (/^\s*(select|with)/i.test(sql)) return [(await st.all()).results];
    const r = await st.run();
    return [{ insertId: r.meta.last_row_id, affectedRows: r.meta.changes }];
  }
};

// ---------- crypto helpers (WebCrypto – no Node modules needed) ----------
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const hmacKey = () => crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

async function signJwt(payload) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + 7 * 864e2 };
  const data = b64u(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))) + '.' + b64u(enc.encode(JSON.stringify(body)));
  return data + '.' + b64u(await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(data)));
}
async function verifyJwt(token) {
  const [h, p, s] = String(token).split('.');
  if (!h || !p || !s) throw new Error('bad token');
  if (!(await crypto.subtle.verify('HMAC', await hmacKey(), unb64u(s), enc.encode(h + '.' + p)))) throw new Error('bad signature');
  const payload = JSON.parse(dec.decode(unb64u(p)));
  if (payload.exp < Date.now() / 1000) throw new Error('expired');
  return payload;
}

const ITER = 100000; // Workers' maximum for PBKDF2
async function pbkdf2(pw, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256);
}
async function hashPw(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64u(salt)}$${b64u(await pbkdf2(pw, salt))}`;
}
async function checkPw(pw, stored) {
  const [alg, , salt, hash] = String(stored).split('$');
  if (alg !== 'pbkdf2') return false;
  return b64u(await pbkdf2(pw, unb64u(salt))) === hash;
}

// ---------- Express-style shim so the route code below stays identical to server.js ----------
const wrap = f => async c => {
  const req = { query: c.req.query(), params: c.req.param(), user: c.get('user'), body: {} };
  if (!['GET', 'HEAD', 'DELETE'].includes(c.req.method)) { try { req.body = await c.req.json(); } catch { req.body = {}; } }
  let code = 200, out;
  const res = { status(n) { code = n; return res; }, json(o) { out = c.json(o, code); return out; } };
  try { await f(req, res); return out || c.json({ ok: true }); }
  catch (e) {
    console.error(e);
    const m = String(e.message);
    if (/FOREIGN KEY/i.test(m)) return c.json({ error: 'This item has bookings and cannot be removed' }, 400);
    if (/UNIQUE/i.test(m)) return c.json({ error: 'Email is already registered' }, 409);
    return c.json({ error: 'Server error' }, 500);
  }
};

// ---------- setup + auth middleware ----------
app.use('/api/*', async (c, next) => {
  D1 = c.env.DB;
  SECRET = c.env.JWT_SECRET || 'pawstay-graduation-project-secret';
  // make sure the default admin account exists (runs once per Worker instance)
  ready ||= (async () => {
    const [adm] = await db.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
    if (!adm.length) await db.query("INSERT INTO users (name,email,password,role) VALUES ('Admin','admin@pawstay.com',?, 'admin')", [await hashPw(c.env.ADMIN_PASSWORD || 'admin123')]);
  })().catch(e => { ready = null; throw e; });
  try { await ready; } catch (e) { console.error(e); return c.json({ error: 'Database is not set up yet' }, 500); }
  await next();
});
const auth = async (c, next) => {
  try { c.set('user', await verifyJwt((c.req.header('authorization') || '').replace('Bearer ', ''))); }
  catch { return c.json({ error: 'Please log in' }, 401); }
  await next();
};
const admin = async (c, next) => c.get('user').role === 'admin' ? next() : c.json({ error: 'Admins only' }, 403);

const nights = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const todayStr = () => new Date().toISOString().slice(0, 10);
const sign = u => signJwt({ id: u.id, role: u.role, name: u.name });
const applyOffer = async (code, kind, total) => {
  if (!code) return { total, discount: 0 };
  const [[o]] = await db.query("SELECT * FROM offers WHERE code=? AND is_active=1 AND applies_to IN ('all',?)", [String(code).trim().toUpperCase(), kind]);
  if (!o) return null;
  const discount = Math.round(total * o.discount_percent) / 100;
  return { total: total - discount, discount };
};
const bad = (res, m, c = 400) => res.status(c).json({ error: m });

// ---------- Auth ----------
app.post('/api/register', wrap(async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password || password.length < 6) return bad(res, 'Name, email and a password of 6+ characters are required');
  const hash = await hashPw(password);
  const [r] = await db.query('INSERT INTO users (name,email,phone,password) VALUES (?,?,?,?)', [name, email.toLowerCase(), phone || null, hash]);
  const u = { id: r.insertId, name, role: 'customer' };
  res.json({ token: await sign(u), user: u });
}));
app.post('/api/login', wrap(async (req, res) => {
  const [[u]] = await db.query('SELECT * FROM users WHERE email=?', [(req.body.email || '').toLowerCase()]);
  if (!u || !(await checkPw(req.body.password || '', u.password))) return bad(res, 'Wrong email or password', 401);
  const user = { id: u.id, name: u.name, role: u.role };
  res.json({ token: await sign(user), user });
}));

// ---------- Public lists ----------
app.get('/api/rooms', wrap(async (req, res) => {
  const { check_in, check_out } = req.query;
  const [rooms] = await db.query('SELECT * FROM rooms WHERE is_available=1 ORDER BY price_per_night');
  const ok = check_in && check_out && nights(check_in, check_out) > 0;
  for (const r of rooms) {
    r.free = true;
    if (ok) {
      const [b] = await db.query("SELECT id FROM bookings WHERE room_id=? AND status NOT IN ('Cancelled','Completed') AND check_in<? AND check_out>?", [r.id, check_out, check_in]);
      r.free = !b.length;
    }
  }
  res.json(rooms);
}));
app.get('/api/offers', wrap(async (q, res) => res.json((await db.query('SELECT id,title,description,discount_percent,code,applies_to FROM offers WHERE is_active=1'))[0])));
app.get('/api/services', wrap(async (q, res) => res.json((await db.query('SELECT * FROM services'))[0])));
app.get('/api/vets', wrap(async (q, res) => res.json((await db.query('SELECT * FROM vets'))[0])));
app.get('/api/trainers', wrap(async (q, res) => res.json((await db.query('SELECT * FROM trainers'))[0])));

// ---------- Pets ----------
app.get('/api/pets', auth, wrap(async (req, res) => res.json((await db.query('SELECT * FROM pets WHERE owner_id=?', [req.user.id]))[0])));
app.post('/api/pets', auth, wrap(async (req, res) => {
  const { name, type, breed, age, special_instructions } = req.body;
  if (!name || !type) return bad(res, 'Pet name and type are required');
  await db.query('INSERT INTO pets (owner_id,name,type,breed,age,special_instructions) VALUES (?,?,?,?,?,?)',
    [req.user.id, name, type, breed || null, age || null, special_instructions || null]);
  res.json({ ok: true });
}));
app.delete('/api/pets/:id', auth, wrap(async (req, res) => {
  await db.query('DELETE FROM pets WHERE id=? AND owner_id=?', [req.params.id, req.user.id]);
  res.json({ ok: true });
}));

// ---------- Hotel bookings ----------
app.post('/api/bookings', auth, wrap(async (req, res) => {
  const { pet_id, room_id, check_in, check_out, service_ids = [] } = req.body;
  const n = nights(check_in, check_out);
  if (!(n > 0)) return bad(res, 'Check-out must be after check-in');
  if (check_in < todayStr()) return bad(res, 'Check-in cannot be in the past');
  const [[pet]] = await db.query('SELECT * FROM pets WHERE id=? AND owner_id=?', [pet_id, req.user.id]);
  if (!pet) return bad(res, 'Choose one of your pets');
  const [[room]] = await db.query('SELECT * FROM rooms WHERE id=? AND is_available=1', [room_id]);
  if (!room || (room.suits !== 'all' && room.suits !== pet.type)) return bad(res, 'This room does not suit your pet');
  const [busy] = await db.query("SELECT id FROM bookings WHERE room_id=? AND status NOT IN ('Cancelled','Completed') AND check_in<? AND check_out>?", [room_id, check_out, check_in]);
  if (busy.length) return bad(res, 'This room is already booked on those dates', 409);
  let svcs = [];
  if (service_ids.length) [svcs] = await db.query('SELECT * FROM services WHERE id IN (?)', [service_ids]);
  const sub = room.price_per_night * n + svcs.reduce((s, x) => s + Number(x.price), 0);
  const ap = await applyOffer(req.body.promo_code, 'hotel', sub);
  if (!ap) return bad(res, 'This offer code is not valid for hotel stays');
  const total = ap.total;
  const [r] = await db.query('INSERT INTO bookings (user_id,pet_id,room_id,check_in,check_out,total_price) VALUES (?,?,?,?,?,?)',
    [req.user.id, pet_id, room_id, check_in, check_out, total]);
  for (const s of svcs) {
    await db.query('INSERT INTO booking_services (booking_id,service_id) VALUES (?,?)', [r.insertId, s.id]);
    if (/feeding|medication/i.test(s.name))
      await db.query('INSERT INTO care_schedules (booking_id,care_type,schedule_time,notes) VALUES (?,?,?,?)', [r.insertId, s.name, '08:00:00', pet.special_instructions]);
  }
  res.json({ id: r.insertId, total });
}));
app.get('/api/bookings', auth, wrap(async (req, res) => res.json((await db.query(
  `SELECT b.id,r.name room,p.name pet,b.check_in,b.check_out,b.total_price,b.status FROM bookings b
   JOIN rooms r ON r.id=b.room_id JOIN pets p ON p.id=b.pet_id WHERE b.user_id=? ORDER BY b.id DESC`, [req.user.id]))[0])));

// ---------- Vet appointments ----------
app.post('/api/appointments', auth, wrap(async (req, res) => {
  const { vet_id, pet_id, appt_date, appt_time, reason, stay_until } = req.body;
  if (!appt_date || !appt_time || appt_date < todayStr()) return bad(res, 'Choose a valid date and time');
  const [[pet]] = await db.query('SELECT id FROM pets WHERE id=? AND owner_id=?', [pet_id, req.user.id]);
  const [[vet]] = await db.query('SELECT * FROM vets WHERE id=?', [vet_id]);
  if (!pet || !vet) return bad(res, 'Invalid pet or vet');
  let total = Number(vet.price);
  if (stay_until) {
    const n = nights(appt_date, stay_until);
    if (!vet.stay_available || !(n > 0)) return bad(res, 'Clinic stay is not available for these dates');
    total += n * Number(vet.stay_price);
  }
  const ap = await applyOffer(req.body.promo_code, 'vet', total);
  if (!ap) return bad(res, 'This offer code is not valid for vet visits');
  const [t] = await db.query("SELECT id FROM appointments WHERE vet_id=? AND appt_date=? AND appt_time=? AND status<>'Cancelled'", [vet_id, appt_date, appt_time]);
  if (t.length) return bad(res, 'This time is already booked. Pick another time.', 409);
  await db.query('INSERT INTO appointments (user_id,pet_id,vet_id,appt_date,appt_time,reason,stay_until,total_price) VALUES (?,?,?,?,?,?,?,?)',
    [req.user.id, pet_id, vet_id, appt_date, appt_time, reason || null, stay_until || null, ap.total]);
  res.json({ total: ap.total });
}));
app.get('/api/appointments', auth, wrap(async (req, res) => res.json((await db.query(
  `SELECT a.id,v.name vet,p.name pet,a.appt_date,a.appt_time,a.stay_until,a.total_price,a.status FROM appointments a
   JOIN vets v ON v.id=a.vet_id JOIN pets p ON p.id=a.pet_id WHERE a.user_id=? ORDER BY a.id DESC`, [req.user.id]))[0])));

// ---------- Training ----------
app.post('/api/training', auth, wrap(async (req, res) => {
  const { trainer_id, pet_id, appt_date, appt_time, notes } = req.body;
  if (!appt_date || !appt_time || appt_date < todayStr()) return bad(res, 'Choose a valid date and time');
  const [[pet]] = await db.query('SELECT id FROM pets WHERE id=? AND owner_id=?', [pet_id, req.user.id]);
  const [[tr]] = await db.query('SELECT * FROM trainers WHERE id=?', [trainer_id]);
  if (!pet || !tr) return bad(res, 'Invalid pet or trainer');
  const ap = await applyOffer(req.body.promo_code, 'training', Number(tr.price));
  if (!ap) return bad(res, 'This offer code is not valid for training');
  const [t] = await db.query("SELECT id FROM training WHERE trainer_id=? AND appt_date=? AND appt_time=? AND status<>'Cancelled'", [trainer_id, appt_date, appt_time]);
  if (t.length) return bad(res, 'This time is already booked. Pick another time.', 409);
  await db.query('INSERT INTO training (user_id,pet_id,trainer_id,appt_date,appt_time,notes,total_price) VALUES (?,?,?,?,?,?,?)',
    [req.user.id, pet_id, trainer_id, appt_date, appt_time, notes || null, ap.total]);
  res.json({ total: ap.total });
}));
app.get('/api/training', auth, wrap(async (req, res) => res.json((await db.query(
  `SELECT t.id,tr.name trainer,p.name pet,t.appt_date,t.appt_time,t.total_price,t.status FROM training t
   JOIN trainers tr ON tr.id=t.trainer_id JOIN pets p ON p.id=t.pet_id WHERE t.user_id=? ORDER BY t.id DESC`, [req.user.id]))[0])));

// ---------- Customer: profile, pet edit, care schedule ----------
app.put('/api/me', auth, wrap(async (req, res) => {
  const { name, phone, password } = req.body;
  if (!name) return bad(res, 'Name is required');
  await db.query('UPDATE users SET name=?,phone=? WHERE id=?', [name, phone || null, req.user.id]);
  if (password) { if (password.length < 6) return bad(res, 'Password must be 6+ characters'); await db.query('UPDATE users SET password=? WHERE id=?', [await hashPw(password), req.user.id]); }
  const u = { id: req.user.id, name, role: req.user.role }; res.json({ token: await sign(u), user: u });
}));
app.get('/api/me', auth, wrap(async (req, res) => res.json((await db.query('SELECT name,email,phone FROM users WHERE id=?', [req.user.id]))[0][0])));
app.put('/api/pets/:id', auth, wrap(async (req, res) => {
  const { name, type, breed, age, special_instructions } = req.body;
  if (!name || !type) return bad(res, 'Pet name and type are required');
  await db.query('UPDATE pets SET name=?,type=?,breed=?,age=?,special_instructions=? WHERE id=? AND owner_id=?', [name, type, breed || null, age || null, special_instructions || null, req.params.id, req.user.id]);
  res.json({ ok: true });
}));
const ownBooking = async (id, uid) => (await db.query("SELECT id FROM bookings WHERE id=? AND user_id=? AND status IN ('Pending','Confirmed','Checked In','In Stay')", [id, uid]))[0].length > 0;
app.get('/api/bookings/:id/care', auth, wrap(async (req, res) => res.json((await db.query('SELECT c.* FROM care_schedules c JOIN bookings b ON b.id=c.booking_id WHERE b.id=? AND b.user_id=? ORDER BY schedule_time', [req.params.id, req.user.id]))[0])));
app.post('/api/bookings/:id/care', auth, wrap(async (req, res) => {
  const { care_type, schedule_time, notes } = req.body;
  if (!care_type || !schedule_time) return bad(res, 'Care type and time are required');
  if (!(await ownBooking(req.params.id, req.user.id))) return bad(res, 'This booking is not active');
  await db.query('INSERT INTO care_schedules (booking_id,care_type,schedule_time,notes) VALUES (?,?,?,?)', [req.params.id, care_type, schedule_time, notes || null]);
  res.json({ ok: true });
}));
app.delete('/api/care/:id', auth, wrap(async (req, res) => {
  await db.query('DELETE FROM care_schedules WHERE id=? AND booking_id IN (SELECT id FROM bookings WHERE user_id=?)', [req.params.id, req.user.id]);
  res.json({ ok: true });
}));

// ---------- Customer cancel ----------
const TABLES = { bookings: 'bookings', appointments: 'appointments', training: 'training' };
app.patch('/api/cancel/:kind/:id', auth, wrap(async (req, res) => {
  const t = TABLES[req.params.kind]; if (!t) return bad(res, 'Unknown type');
  const [r] = await db.query(`UPDATE ${t} SET status='Cancelled' WHERE id=? AND user_id=? AND status IN ('Pending','Confirmed')`, [req.params.id, req.user.id]);
  r.affectedRows ? res.json({ ok: true }) : bad(res, 'This item cannot be cancelled');
}));

// ---------- Admin ----------
const LISTS = {
  bookings: `SELECT b.id,u.name customer,p.name pet,r.name room,b.check_in,b.check_out,b.total_price,b.status FROM bookings b JOIN users u ON u.id=b.user_id JOIN pets p ON p.id=b.pet_id JOIN rooms r ON r.id=b.room_id ORDER BY b.id DESC`,
  appointments: `SELECT a.id,u.name customer,p.name pet,v.name vet,a.appt_date,a.appt_time,a.reason,a.stay_until,a.total_price,a.status FROM appointments a JOIN users u ON u.id=a.user_id JOIN pets p ON p.id=a.pet_id JOIN vets v ON v.id=a.vet_id ORDER BY a.id DESC`,
  training: `SELECT t.id,u.name customer,p.name pet,tr.name trainer,t.appt_date,t.appt_time,t.notes,t.total_price,t.status FROM training t JOIN users u ON u.id=t.user_id JOIN pets p ON p.id=t.pet_id JOIN trainers tr ON tr.id=t.trainer_id ORDER BY t.id DESC`,
  rooms: 'SELECT * FROM rooms',
  services: 'SELECT * FROM services',
  vets: 'SELECT * FROM vets',
  trainers: 'SELECT * FROM trainers',
  offers: 'SELECT * FROM offers',
  pets: 'SELECT p.id,u.name owner,p.name,p.type,p.breed,p.age,p.special_instructions FROM pets p JOIN users u ON u.id=p.owner_id ORDER BY p.id DESC',
  care: 'SELECT c.id,c.booking_id,p.name pet,c.care_type,c.schedule_time,c.notes,b.status FROM care_schedules c JOIN bookings b ON b.id=c.booking_id JOIN pets p ON p.id=b.pet_id ORDER BY b.id DESC,c.schedule_time',
  customers: "SELECT id,name,email,phone,created_at FROM users WHERE role='customer' ORDER BY id DESC"
};
app.get('/api/admin/stats', auth, admin, wrap(async (req, res) => {
  const one = async s => (await db.query(s))[0][0];
  const OK = "('Confirmed','Checked In','In Stay','Completed')";
  const rev = async t => Number((await one(`SELECT COALESCE(SUM(total_price),0) v FROM ${t} WHERE status IN ${OK}`)).v);
  const [hotel, vet, training] = await Promise.all([rev('bookings'), rev('appointments'), rev('training')]);
  const [months] = await db.query(`SELECT m,SUM(t) total FROM (
    SELECT strftime('%Y-%m',created_at) m,total_price t FROM bookings WHERE status IN ${OK}
    UNION ALL SELECT strftime('%Y-%m',created_at),total_price FROM appointments WHERE status IN ${OK}
    UNION ALL SELECT strftime('%Y-%m',created_at),total_price FROM training WHERE status IN ${OK}) x GROUP BY m ORDER BY m DESC LIMIT 12`);
  const [statuses] = await db.query('SELECT status,COUNT(*) n FROM bookings GROUP BY status');
  const [care] = await db.query(`SELECT c.care_type,c.schedule_time,c.notes,p.name pet FROM care_schedules c JOIN bookings b ON b.id=c.booking_id JOIN pets p ON p.id=b.pet_id WHERE b.status IN ('Checked In','In Stay') ORDER BY c.schedule_time`);
  const pend = async t => (await one(`SELECT COUNT(*) n FROM ${t} WHERE status='Pending'`)).n;
  res.json({
    customers: (await one("SELECT COUNT(*) n FROM users WHERE role='customer'")).n,
    pets: (await one('SELECT COUNT(*) n FROM pets')).n,
    revenue: { hotel, vet, training, total: hotel + vet + training }, months, statuses, care,
    // Cairo is UTC+2 (UTC+3 in summer time); Workers run in UTC so shift the clock
    checkins: (await one("SELECT COUNT(*) n FROM bookings WHERE check_in=date('now','+2 hours') AND status<>'Cancelled'")).n,
    checkouts: (await one("SELECT COUNT(*) n FROM bookings WHERE check_out=date('now','+2 hours') AND status<>'Cancelled'")).n,
    pending: { bookings: await pend('bookings'), appointments: await pend('appointments'), training: await pend('training') }
  });
}));

// ---------- Admin: care schedules + full CRUD ----------
const FIELDS = {
  rooms: ['name', 'room_type', 'suits', 'description', 'price_per_night', 'is_available'],
  services: ['name', 'description', 'price'],
  vets: ['name', 'clinic', 'specialty', 'description', 'pet_types', 'address', 'phone', 'price', 'stay_available', 'stay_price'],
  trainers: ['name', 'pet_type', 'specialty', 'description', 'phone', 'price'],
  offers: ['title', 'description', 'discount_percent', 'code', 'applies_to', 'is_active']
};
app.post('/api/admin/care', auth, admin, wrap(async (req, res) => {
  const { booking_id, care_type, schedule_time, notes } = req.body;
  if (!booking_id || !care_type || !schedule_time) return bad(res, 'Booking, care type and time are required');
  await db.query('INSERT INTO care_schedules (booking_id,care_type,schedule_time,notes) VALUES (?,?,?,?)', [booking_id, care_type, schedule_time, notes || null]);
  res.json({ ok: true });
}));
app.delete('/api/admin/care/:id', auth, admin, wrap(async (req, res) => { await db.query('DELETE FROM care_schedules WHERE id=?', [req.params.id]); res.json({ ok: true }); }));
app.post('/api/admin/:what', auth, admin, wrap(async (req, res) => {
  const t = req.params.what, f = FIELDS[t]; if (!f) return bad(res, 'Unknown type', 404);
  if (req.body.code) req.body.code = String(req.body.code).toUpperCase();
  if (!(req.body.name || req.body.title)) return bad(res, 'Name is required');
  await db.query(`INSERT INTO ${t} (${f.join(',')}) VALUES (${f.map(() => '?').join(',')})`, f.map(k => req.body[k] === '' ? null : (req.body[k] ?? null)));
  res.json({ ok: true });
}));
app.put('/api/admin/:what/:id', auth, admin, wrap(async (req, res) => {
  const t = req.params.what, f = FIELDS[t]; if (!f) return bad(res, 'Unknown type', 404);
  if (req.body.code) req.body.code = String(req.body.code).toUpperCase();
  await db.query(`UPDATE ${t} SET ${f.map(k => k + '=?').join(',')} WHERE id=?`, [...f.map(k => req.body[k] === '' ? null : (req.body[k] ?? null)), req.params.id]);
  res.json({ ok: true });
}));
app.delete('/api/admin/:what/:id', auth, admin, wrap(async (req, res) => {
  const t = req.params.what;
  if (!FIELDS[t] && !['pets', 'customers'].includes(t)) return bad(res, 'Unknown type', 404);
  if (t === 'customers') await db.query("DELETE FROM users WHERE id=? AND role='customer'", [req.params.id]);
  else await db.query(`DELETE FROM ${t} WHERE id=?`, [req.params.id]);
  res.json({ ok: true });
}));
app.get('/api/admin/:what', auth, admin, wrap(async (req, res) => {
  const q = LISTS[req.params.what]; if (!q) return bad(res, 'Unknown list', 404);
  res.json((await db.query(q))[0]);
}));
app.patch('/api/admin/:what/:id', auth, admin, wrap(async (req, res) => {
  const t = TABLES[req.params.what];
  const ok = ['Pending', 'Confirmed', 'Checked In', 'In Stay', 'Completed', 'Cancelled'];
  if (!t || !ok.includes(req.body.status)) return bad(res, 'Invalid request');
  await db.query(`UPDATE ${t} SET status=? WHERE id=?`, [req.body.status, req.params.id]);
  res.json({ ok: true });
}));

app.notFound(c => c.json({ error: 'Not found' }, 404));
export default app;
