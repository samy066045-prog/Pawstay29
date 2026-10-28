const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EGP = n => 'EGP ' + Number(n).toLocaleString();
const today = (d = 0) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const nightsBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
let token = localStorage.token || '', user = JSON.parse(localStorage.user || 'null');

function toast(m, bad) { const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }
async function api(url, method = 'GET', body) {
  const r = await fetch('/api' + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 401 && token) logout(); throw new Error(d.error || 'Something went wrong'); }
  return d;
}
function logout() { localStorage.clear(); token = ''; user = null; location.hash = '#/'; route(); }
const view = h => $('#app').innerHTML = h;
const banner = (t, s) => `<div class="ban"><div class="wrap"><h1>${t}</h1><p>${s || ''}</p></div></div>`;
const go = h => { location.hash = h; };
const pill = s => `<span class="pill ${esc(s)}">${esc(s)}</span>`;

function nav() {
  const h = location.hash || '#/', a = (p, t) => `<a href="#/${p}" class="${h === '#/' + p ? 'on' : ''}">${t}</a>`;
  $('#nav').innerHTML = a('', 'Home') + a('hotel', 'Pet Hotel') + a('vets', 'Vets') + a('trainers', 'Trainers') +
    (user ? (user.role === 'admin' ? a('admin', 'Dashboard') : a('account', 'My Account')) + '<a href="#" onclick="logout();return false">Log out</a>'
      : a('login', 'Log in') + '<a class="btn-sm" href="#/register">Sign up</a>');
}
const routes = { '': home, hotel, vets, trainers, login, register, account, admin: () => adminPage('overview') };
async function route() {
  nav(); window.scrollTo(0, 0);
  try { await (routes[location.hash.replace('#/', '')] || home)(); }
  catch (e) { view(`<div class="wrap"><p class="err">${esc(e.message)}</p></div>`); }
}

// ---------- Cards ----------
const roomCard = r => `<div class="card room"><div class="tags"><i>${r.room_type}</i><i class="t2">${r.suits === 'all' ? 'All pets' : r.suits + 's'}</i></div><b>${esc(r.name)}</b><p>${esc(r.description)}</p><strong>${EGP(r.price_per_night)}</strong> / night</div>`;
const vetCard = v => `<div class="card pro"><div class="tags"><i>Vet</i>${v.stay_available ? '<i>Clinic stay available</i>' : ''}</div><b>${esc(v.name)}</b><small>${esc(v.clinic)} · ${esc(v.specialty)}</small><p class="mut">${esc(v.description)}</p><small>Works with: ${esc(v.pet_types.replace(/,/g, ', '))}</small><small>📍 ${esc(v.address)}</small><small>📞 ${esc(v.phone)}</small><div class="price">${EGP(v.price)} <small style="display:inline">/ visit</small></div>${v.stay_available ? `<small>Clinic stay: ${EGP(v.stay_price)} / night</small>` : ''}<button class="btn full" onclick="bookModal('vet',${v.id})">Book appointment</button></div>`;
const trCard = t => `<div class="card pro"><div class="tags"><i>Trainer</i><i>${esc(t.pet_type)}</i></div><b>${esc(t.name)}</b><small>${esc(t.specialty)}</small><p class="mut">${esc(t.description)}</p><small>📞 ${esc(t.phone)}</small><div class="price">${EGP(t.price)} <small style="display:inline">/ session</small></div><button class="btn full" onclick="bookModal('trainer',${t.id})">Book a session</button></div>`;

let OFFERS = [];
const offerFor = (code, kind) => (code || '').trim() ? OFFERS.find(o => o.code === code.trim().toUpperCase() && ['all', kind].includes(o.applies_to)) : null;
const SICON = { Grooming: '✂️', 'Daily Walking': '🦮', 'Special Feeding': '🍖', 'Medication Reminder': '💊', 'Play Time': '🎾', 'Daily Photo Update': '📸' };
const serviceCard = s => `<div class="card"><h3>${SICON[s.name] || '🐾'} ${esc(s.name)}</h3><p class="mut">${esc(s.description)}</p><b>${EGP(s.price)}</b></div>`;
const offerCard = o => `<div class="card offer"><b>${o.discount_percent}% off</b><h3>${esc(o.title)}</h3><p class="mut">${esc(o.description)}</p><span class="code">Code: ${esc(o.code)}</span> <small class="mut">${o.applies_to === 'all' ? 'All services' : o.applies_to}</small></div>`;

// ---------- Home ----------
async function home() {
  const [rooms, vs, trs, svs, offers] = await Promise.all([api('/rooms'), api('/vets'), api('/trainers'), api('/services'), api('/offers')]);
  view(`<div class="hero"><div class="wrap hero-in"><div><h1>Everything your pet needs, <span>in one place</span></h1><p>Book a comfortable stay, see a trusted vet, or find a trainer for your dog or cat. PawStay connects pet owners with everything their pets need.</p><a class="btn" href="#/hotel">Book a stay</a><a class="btn ghost" href="#/vets">Find a vet</a><a class="btn ghost" href="#/trainers">Find a trainer</a></div><div class="emo">🐶🐱</div></div></div>
  <section><div class="wrap"><h2 class="c">One platform, three ways we care</h2><div class="g3">
   <div class="card"><h3>🏨 Pet Hotel</h3><p class="mut">Choose a room, pick your dates, and add grooming, walking, feeding, and medication reminders. See the total before you confirm.</p><a href="#/hotel">Book a stay</a></div>
   <div class="card"><h3>🩺 Vets & Clinics</h3><p class="mut">Book an appointment with a pet doctor online. Some clinics can also keep your pet for treatment or recovery.</p><a href="#/vets">Find a vet</a></div>
   <div class="card"><h3>🎓 Pet Trainers</h3><p class="mut">Connect with dog trainers and cat trainers who help your pet learn good behavior.</p><a href="#/trainers">Find a trainer</a></div></div></div></section>
  <section class="alt"><div class="wrap"><h2 class="c">How it works</h2><div class="steps">
   <div><i>1</i><b>Create an account</b><small>Sign up and add your pets with their special care instructions.</small></div>
   <div><i>2</i><b>Choose what you need</b><small>A hotel room, a vet appointment, or a training session.</small></div>
   <div><i>3</i><b>See the price</b><small>The total is calculated automatically before you confirm.</small></div>
   <div><i>4</i><b>Track everything</b><small>Follow each booking from Pending to Completed.</small></div></div></div></section>
  <section><div class="wrap"><h2 class="c">Our rooms</h2><div class="g3">${rooms.map(roomCard).join('')}</div><p style="text-align:center;margin-top:18px"><a class="btn" href="#/hotel">Book a room</a></p></div></section>
  <section class="alt"><div class="wrap"><h2 class="c">Our services</h2><div class="g3">${svs.map(serviceCard).join('')}</div><p class="mut" style="text-align:center;margin-top:14px">Add any of these to your pet's stay when you book a room.</p></div></section>
  <section><div class="wrap"><h2 class="c">Special offers</h2><div class="g3">${offers.map(offerCard).join('') || '<p class="mut">No offers right now.</p>'}</div><p class="mut" style="text-align:center;margin-top:14px">Enter the offer code when you book to get the discount.</p></div></section>
  <section class="alt"><div class="wrap"><h2 class="c">Meet our vets and trainers</h2><div class="g3">${vs.map(vetCard).join('')}${trs.map(trCard).join('')}</div></div></section>`);
}

// ---------- Auth ----------
function login() {
  view(banner('Welcome back', 'Log in to manage your pets and bookings.') + `<div class="wrap narrow" style="padding-top:24px"><form class="card" onsubmit="return doAuth(event,'login')"><label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" required></label><button class="btn full">Log in</button><p class="mut">New here? <a href="#/register">Create an account</a></p></form></div>`);
}
function register() {
  view(banner('Create your account', 'Add your pets and start booking in minutes.') + `<div class="wrap narrow" style="padding-top:24px"><form class="card" onsubmit="return doAuth(event,'register')"><label>Full name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Phone<input name="phone"></label><label>Password (6+ characters)<input name="password" type="password" minlength="6" required></label><button class="btn full">Create account</button><p class="mut">Already registered? <a href="#/login">Log in</a></p></form></div>`);
}
async function doAuth(e, kind) {
  e.preventDefault();
  try {
    const d = await api('/' + kind, 'POST', Object.fromEntries(new FormData(e.target)));
    token = d.token; user = d.user; localStorage.token = token; localStorage.user = JSON.stringify(user);
    go(user.role === 'admin' ? '#/admin' : '#/account'); route();
  } catch (x) { toast(x.message, 1); }
  return false;
}

// ---------- Hotel booking ----------
let H = {};
async function hotel() {
  if (!user) return go('#/login');
  const [pets, svcs, off] = await Promise.all([api('/pets'), api('/services'), api('/offers')]); OFFERS = off;
  const head = banner('🏨 Book a stay', 'Choose your pet, dates, and room. Add services and see the total before you confirm.');
  if (!pets.length) return view(head + `<div class="wrap" style="padding-top:22px"><div class="card">Add a pet first so we know who is staying. <a href="#/account">Add a pet</a></div></div>`);
  H = { promo: '', pets, svcs, ci: today(1), co: today(4), room: null, sv: new Set(), rooms: [] };
  view(head + `<div class="wrap book"><div>
   <div class="card"><h3>1. Your pet and dates</h3><label>Pet<select id="pet" onchange="hset()">${pets.map(p => `<option value="${p.id}">${esc(p.name)} (${p.type})</option>`).join('')}</select></label>
    <div class="row"><label>Check-in<input type="date" id="ci" min="${today()}" value="${H.ci}" onchange="hset()"></label><label>Check-out<input type="date" id="co" min="${today(1)}" value="${H.co}" onchange="hset()"></label></div></div>
   <div class="card"><h3>2. Choose a room</h3><p class="mut">Showing which rooms are free on your dates.</p><div class="g2" id="rooms"></div></div>
   <div class="card"><h3>3. Add care services (optional)</h3>${svcs.map(s => `<label class="chk"><input type="checkbox" value="${s.id}" onchange="hsv(this)"><span style="margin:0;font-weight:400"><b>${esc(s.name)}</b> – ${esc(s.description)}</span><span>${EGP(s.price)}</span></label>`).join('')}</div>
  </div><aside class="card" id="sum"></aside></div>`);
  hset();
}
async function hset() {
  H.pet = +$('#pet').value; H.ci = $('#ci').value; H.co = $('#co').value;
  const p = H.pets.find(x => x.id === H.pet);
  H.rooms = (await api(`/rooms?check_in=${H.ci}&check_out=${H.co}`)).filter(r => r.suits === 'all' || r.suits === p.type);
  if (!H.rooms.find(r => r.id === H.room && r.free)) H.room = null;
  hdraw();
}
function hdraw() {
  $('#rooms').innerHTML = H.rooms.map(r => `<div class="room ${r.free ? '' : 'off'} ${H.room === r.id ? 'sel' : ''}" ${r.free ? `onclick="H.room=${r.id};hdraw()"` : ''}><div class="tags"><i>${r.room_type}</i><i class="t2">${r.suits === 'all' ? 'All pets' : r.suits + 's'}</i></div><b>${esc(r.name)}</b><p>${esc(r.description)}</p><strong>${EGP(r.price_per_night)}</strong> / night${r.free ? '' : ' · Booked'}</div>`).join('') || '<p class="mut">No rooms suit this pet.</p>';
  const n = nightsBetween(H.ci, H.co), r = H.rooms.find(x => x.id === H.room), ss = H.svcs.filter(s => H.sv.has(s.id));
  let h = '<h3>Booking summary</h3>';
  if (!(n > 0)) h += '<p class="err">Check-out must be after check-in.</p>';
  else if (!r) h += '<p class="mut">Pick a room to see your total.</p>';
  else {
    const rt = r.price_per_night * n, sub = rt + ss.reduce((a, s) => a + Number(s.price), 0), of = offerFor(H.promo, 'hotel'), disc = of ? Math.round(sub * of.discount_percent) / 100 : 0, t = sub - disc;
    h += `<div class="ln"><span>${esc(r.name)} ${EGP(r.price_per_night)} × ${n} night${n > 1 ? 's' : ''}</span><b>${EGP(rt)}</b></div>` +
      ss.map(s => `<div class="ln"><span>${esc(s.name)}</span><b>${EGP(s.price)}</b></div>`).join('') +
      `${disc ? `<div class="ln"><span>Offer ${of.code} (−${of.discount_percent}%)</span><b>−${EGP(disc)}</b></div>` : ''}<div class="ln tot"><span>Total</span><b>${EGP(t)}</b></div><label style="margin-top:8px">Offer code (optional)<input value="${esc(H.promo)}" onchange="H.promo=this.value.trim().toUpperCase();hdraw()"></label>${H.promo && !of ? '<p class="err">This code is not valid for hotel stays.</p>' : ''}<button class="btn full" onclick="hgo()">Confirm booking</button><p class="mut">Your booking starts as Pending until the hotel confirms it.</p>`;
  }
  $('#sum').innerHTML = h;
}
function hsv(el) { el.checked ? H.sv.add(+el.value) : H.sv.delete(+el.value); hdraw(); }
async function hgo() {
  try { await api('/bookings', 'POST', { pet_id: H.pet, room_id: H.room, check_in: H.ci, check_out: H.co, service_ids: [...H.sv], promo_code: H.promo }); toast('Booking confirmed as Pending'); go('#/account'); }
  catch (e) { toast(e.message, 1); }
}

// ---------- Vets & trainers ----------
let LIST = [];
async function directory(kind) {
  LIST = await api('/' + kind);
  const vet = kind === 'vets';
  view(banner(vet ? '🩺 Find a vet' : '🎓 Find a trainer', vet ? 'Book an appointment with a pet doctor.' : 'Book a training session for your pet.') +
    `<div class="wrap" style="padding-top:22px"><div class="card row"><label>Search<input id="q" oninput="ddraw('${kind}')" placeholder="Name or specialty"></label><label>Pet type<select id="ft" onchange="ddraw('${kind}')"><option value="">All pets</option><option>Dog</option><option>Cat</option></select></label></div><div class="g3" id="list"></div></div>`);
  ddraw(kind);
}
function ddraw(kind) {
  const q = $('#q').value.toLowerCase(), f = $('#ft').value, vet = kind === 'vets';
  $('#list').innerHTML = LIST.filter(x => (x.name + (x.clinic || '') + x.specialty).toLowerCase().includes(q) && (!f || (vet ? x.pet_types : x.pet_type).includes(f))).map(vet ? vetCard : trCard).join('') || '<p class="mut">No results. Try a different search.</p>';
}
function vets() { return directory('vets'); }
function trainers() { return directory('trainers'); }

let M = {};
async function bookModal(kind, id) {
  if (!user) return go('#/login');
  const item = LIST.find(x => x.id === id), pets = await api('/pets'); OFFERS = await api('/offers');
  if (!pets.length) { toast('Add a pet first', 1); return go('#/account'); }
  const vet = kind === 'vet'; M = { kind, item, time: '' };
  const m = document.createElement('div'); m.className = 'ov';
  m.innerHTML = `<div class="md"><button class="x" onclick="this.closest('.ov').remove()">×</button><h3>Book ${vet ? 'appointment' : 'a session'} with ${esc(item.name)}</h3>
   <label>Pet<select id="mp">${pets.map(p => `<option value="${p.id}">${esc(p.name)} (${p.type})</option>`).join('')}</select></label>
   <label>Date<input type="date" id="md" min="${today()}" value="${today(1)}" onchange="mtot()"></label>
   <label>Time</label><div class="slots">${['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'].map(t => `<button type="button" class="slot" onclick="M.time='${t}';document.querySelectorAll('.slot').forEach(b=>b.classList.toggle('on',b.textContent==='${t}'))">${t}</button>`).join('')}</div>
   <label>${vet ? 'Reason for the visit' : 'What should the trainer work on?'}<textarea id="mr"></textarea></label>
   ${vet && item.stay_available ? `<label class="chk"><input type="checkbox" id="ms" onchange="mtot()"><span style="margin:0;font-weight:400">My pet needs to <b>stay at the clinic</b> (${EGP(item.stay_price)} / night)</span></label><label id="mw" hidden>Stay until (check-out date)<input type="date" id="mu" min="${today(2)}" value="${today(3)}" onchange="mtot()"></label>` : ''}
   <label>Offer code (optional)<input id="mo" oninput="mtot()"></label><div class="mt" id="mt"></div><button class="btn full" onclick="msave()">Confirm</button></div>`;
  document.body.appendChild(m); mtot();
}
function mstay() { const s = $('#ms'); return s && s.checked; }
function mtot() {
  const it = M.item, vet = M.kind === 'vet'; let t = Number(it.price), h = '';
  if (vet && $('#mw')) $('#mw').hidden = !mstay();
  if (vet && mstay()) { const n = nightsBetween($('#md').value, $('#mu').value); if (n > 0) { t += n * Number(it.stay_price); h = ` (${EGP(it.price)} visit + ${n} night${n > 1 ? 's' : ''} stay)`; } }
  const code = $('#mo').value.trim(), of = offerFor(code, vet ? 'vet' : 'training');
  if (of) { t -= Math.round(t * of.discount_percent) / 100; h += ` − ${of.discount_percent}% offer`; }
  $('#mt').textContent = `Total: ${EGP(t)}${h}` + (code && !of ? ' (offer code not valid here)' : '');
}
async function msave() {
  if (!M.time) return toast('Pick a time', 1);
  const vet = M.kind === 'vet', b = { pet_id: +$('#mp').value, appt_date: $('#md').value, appt_time: M.time };
  try {
    if (vet) await api('/appointments', 'POST', { ...b, vet_id: M.item.id, reason: $('#mr').value, promo_code: $('#mo').value.trim(), stay_until: mstay() ? $('#mu').value : null });
    else await api('/training', 'POST', { ...b, trainer_id: M.item.id, notes: $('#mr').value, promo_code: $('#mo').value.trim() });
    document.querySelector('.ov').remove(); toast('Request sent as Pending'); go('#/account');
  } catch (e) { toast(e.message, 1); }
}

// ---------- Tables ----------
function tbl(rows, cols, act) {
  if (!rows.length) return '<p class="mut">Nothing here yet.</p>';
  const cell = (k, v, r) => k === 'status' ? pill(v) : /price|total/.test(k) && v !== null && !isNaN(v) ? EGP(v) : esc(v ?? '–');
  return `<div class="tbl"><table><tr>${cols.map(c => `<th>${c.replace(/_/g, ' ')}</th>`).join('')}${act ? '<th></th>' : ''}</tr>${rows.map(r => `<tr>${cols.map(c => `<td>${cell(c, r[c], r)}</td>`).join('')}${act ? `<td>${act(r)}</td>` : ''}</tr>`).join('')}</table></div>`;
}

// ---------- Customer account ----------
async function account() {
  if (!user) return go('#/login');
  const [pets, b, a, t] = await Promise.all([api('/pets'), api('/bookings'), api('/appointments'), api('/training')]);
  PETS = pets;
  const cancel = k => r => ['Pending', 'Confirmed'].includes(r.status) ? `<button onclick="cancelIt('${k}',${r.id})">Cancel</button>` : '';
  view(banner('My account', `Hello ${esc(user.name)}`) + `<div class="wrap" style="padding-top:22px">
   <p><button class="btn" onclick="editProfile()">Edit my profile</button></p>
   <div class="card"><h3>My pets</h3><div class="g3">${pets.map(p => `<div class="pet">🐾 <b>${esc(p.name)}</b><span>${p.type}${p.breed ? ' · ' + esc(p.breed) : ''}${p.age ? ' · ' + p.age + ' yrs' : ''}</span><small>${esc(p.special_instructions || '')}</small><a href="#" onclick="editPet(${p.id});return false">Edit</a> <a href="#" onclick="delPet(${p.id});return false">Remove</a></div>`).join('') || '<p class="mut">No pets yet. Add your first pet below.</p>'}</div>
   <form onsubmit="return addPet(event)"><div class="row3"><label>Name<input name="name" required></label><label>Type<select name="type"><option>Dog</option><option>Cat</option><option>Rabbit</option><option>Bird</option><option>Other</option></select></label><label>Breed<input name="breed"></label><label>Age<input name="age" type="number" min="0"></label></div><label>Special care instructions<textarea name="special_instructions" placeholder="Allergies, feeding schedule, medication…"></textarea></label><button class="btn">Add pet</button></form></div>
   <div class="card"><h3>Hotel bookings</h3>${tbl(b, ['id', 'room', 'pet', 'check_in', 'check_out', 'total_price', 'status'], r => (['Pending', 'Confirmed', 'Checked In', 'In Stay'].includes(r.status) ? `<button class="ed" onclick="careModal(${r.id})">Care</button> ` : '') + cancel('bookings')(r))}</div>
   <div class="card"><h3>Vet appointments</h3>${tbl(a, ['id', 'vet', 'pet', 'appt_date', 'appt_time', 'stay_until', 'total_price', 'status'], cancel('appointments'))}</div>
   <div class="card"><h3>Training sessions</h3>${tbl(t, ['id', 'trainer', 'pet', 'appt_date', 'appt_time', 'total_price', 'status'], cancel('training'))}</div></div>`);
}
async function addPet(e) { e.preventDefault(); try { await api('/pets', 'POST', Object.fromEntries(new FormData(e.target))); toast('Pet added'); account(); } catch (x) { toast(x.message, 1); } return false; }
async function delPet(id) { if (!confirm('Remove this pet?')) return; try { await api('/pets/' + id, 'DELETE'); account(); } catch (x) { toast(x.message, 1); } }
async function cancelIt(k, id) { if (!confirm('Cancel this?')) return; try { await api(`/cancel/${k}/${id}`, 'PATCH'); toast('Cancelled'); account(); } catch (x) { toast(x.message, 1); } }

// ---------- Admin ----------
const TABS = [['overview', 'Overview'], ['bookings', 'Bookings', 'bookings'], ['appointments', 'Vet appointments', 'appointments'], ['training', 'Training', 'training'], ['care', 'Care schedules'], ['rooms', 'Rooms'], ['services', 'Services'], ['vets', 'Vets'], ['trainers', 'Trainers'], ['offers', 'Offers'], ['pets', 'Pets'], ['customers', 'Customers']];
const STATUS = { bookings: ['Pending', 'Confirmed', 'Checked In', 'In Stay', 'Completed', 'Cancelled'], appointments: ['Pending', 'Confirmed', 'Completed', 'Cancelled'], training: ['Pending', 'Confirmed', 'Completed', 'Cancelled'] };
async function adminPage(tab) {
  if (!user || user.role !== 'admin') return go('#/login');
  const s = await api('/admin/stats'); let body;
  if (tab === 'overview') {
    const st = ['Pending', 'Confirmed', 'Checked In', 'In Stay', 'Completed', 'Cancelled'], cnt = k => (s.statuses.find(x => x.status === k) || { n: 0 }).n;
    body = `<div class="stats"><div class="stat"><b>${s.customers}</b><span>Customers</span></div><div class="stat"><b>${s.pets}</b><span>Pets</span></div><div class="stat"><b>${EGP(s.revenue.total)}</b><span>Total revenue</span></div><div class="stat"><b>${s.checkins}</b><span>Check-ins today</span></div><div class="stat"><b>${s.checkouts}</b><span>Check-outs today</span></div></div>
    <div class="g2c"><div class="card"><h3>Revenue by service</h3><div class="ln"><span>🏨 Pet hotel</span><b>${EGP(s.revenue.hotel)}</b></div><div class="ln"><span>🩺 Vet appointments</span><b>${EGP(s.revenue.vet)}</b></div><div class="ln"><span>🎓 Training</span><b>${EGP(s.revenue.training)}</b></div><p class="mut">Counts confirmed, active, and completed items.</p></div>
    <div class="card"><h3>Revenue by month</h3>${s.months.map(m => `<div class="ln"><span>${m.m}</span><b>${EGP(m.total)}</b></div>`).join('') || '<p class="mut">No revenue yet.</p>'}</div></div>
    <div class="card"><h3>Bookings by status</h3>${st.map(k => `${pill(k)} ${cnt(k)} &nbsp;`).join('')}</div>
    <div class="card"><h3>Today's care log <span class="mut">(pets currently staying)</span></h3>${s.care.length ? tbl(s.care, ['pet', 'care_type', 'schedule_time', 'notes']) : '<p class="mut">No care times for pets that are currently checked in.</p>'}</div>`;
  } else {
    const rows = await api('/admin/' + tab), t = TABS.find(x => x[0] === tab); AR = rows;
    const crud = !!F[tab], st = !!t[2];
    const act = r => (st ? `<select onchange="setStatus('${tab}',${r.id},this.value)">${STATUS[tab].map(o => `<option ${o === r.status ? 'selected' : ''}>${o}</option>`).join('')}</select>` : '') + (crud ? `<button class="ed" onclick="adminForm('${tab}',${r.id})">Edit</button> ` : '') + (crud || ['customers', 'pets', 'care'].includes(tab) ? `<button onclick="adminDel('${tab}',${r.id})">Delete</button>` : '');
    const add = crud ? `<button class="btn" onclick="adminForm('${tab}')">+ Add ${t[1].replace(/s$/, '')}</button>` : tab === 'care' ? `<button class="btn" onclick="careForm()">+ Add care time</button>` : '';
    body = `<p>${add}</p><div class="card">${tbl(rows, Object.keys(rows[0] || {}), act)}</div>`;
  }
  view(banner('Admin dashboard', 'Manage customers, pets, rooms, services, bookings, appointments, and trainers.') +
    `<div class="wrap"><div class="tabs">${TABS.map(([k, l, p]) => `<a class="${k === tab ? 'on' : ''}" onclick="adminPage('${k}')">${l}${p && s.pending[p] ? `<b>${s.pending[p]}</b>` : ''}</a>`).join('')}</div>${body}</div>`);
}
async function setStatus(tab, id, status) { try { await api(`/admin/${tab}/${id}`, 'PATCH', { status }); toast('Status updated'); adminPage(tab); } catch (e) { toast(e.message, 1); } }

// ---------- Generic form modal ----------
let PETS = [], AR = [];
function formModal(title, fields, v, save) {
  const m = document.createElement('div'); m.className = 'ov';
  const inp = f => {
    const val = v?.[f.k] ?? '';
    if (f.t === 'select') return `<select name="${f.k}">${f.o.map(o => `<option ${o == val ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    if (f.t === 'textarea') return `<textarea name="${f.k}">${esc(val)}</textarea>`;
    if (f.t === 'check') return `<input type="checkbox" name="${f.k}" ${+val ? 'checked' : ''} style="width:auto">`;
    return `<input name="${f.k}" type="${f.t || 'text'}" value="${esc(val)}" ${f.r ? 'required' : ''} ${f.t === 'number' ? 'step="any" min="0"' : ''}>`;
  };
  m.innerHTML = `<div class="md"><button class="x" onclick="this.closest('.ov').remove()">×</button><h3>${title}</h3><form>${fields.map(f => `<label>${f.l}${inp(f)}</label>`).join('')}<button class="btn full">Save</button></form></div>`;
  m.querySelector('form').onsubmit = async e => {
    e.preventDefault(); const o = {};
    fields.forEach(f => { const el = e.target.elements[f.k]; o[f.k] = f.t === 'check' ? el.checked : f.t === 'number' ? (el.value === '' ? null : +el.value) : el.value; });
    try { await save(o); m.remove(); } catch (x) { toast(x.message, 1); }
  };
  document.body.appendChild(m);
}
const CARE = ['Feeding', 'Medication', 'Walking', 'Play Time', 'Grooming', 'Other'];
const F = {
  offers: [{ k: 'title', l: 'Title', r: 1 }, { k: 'description', l: 'Description', t: 'textarea' }, { k: 'discount_percent', l: 'Discount (%)', t: 'number', r: 1 }, { k: 'code', l: 'Offer code (e.g. SAVE10)', r: 1 }, { k: 'applies_to', l: 'Applies to', t: 'select', o: ['all', 'hotel', 'vet', 'training'] }, { k: 'is_active', l: 'Active', t: 'check' }],
  rooms: [{ k: 'name', l: 'Name', r: 1 }, { k: 'room_type', l: 'Room type', t: 'select', o: ['Standard', 'Deluxe', 'Luxury'] }, { k: 'suits', l: 'Suits (pet type)', t: 'select', o: ['all', 'Dog', 'Cat'] }, { k: 'description', l: 'Description', t: 'textarea' }, { k: 'price_per_night', l: 'Price per night (EGP)', t: 'number', r: 1 }, { k: 'is_available', l: 'Available for booking', t: 'check' }],
  services: [{ k: 'name', l: 'Name', r: 1 }, { k: 'description', l: 'Description', t: 'textarea' }, { k: 'price', l: 'Price (EGP)', t: 'number', r: 1 }],
  vets: [{ k: 'name', l: 'Doctor name', r: 1 }, { k: 'clinic', l: 'Clinic' }, { k: 'specialty', l: 'Specialty' }, { k: 'description', l: 'Description', t: 'textarea' }, { k: 'pet_types', l: 'Pet types (e.g. Dog,Cat)' }, { k: 'address', l: 'Address' }, { k: 'phone', l: 'Phone' }, { k: 'price', l: 'Visit price (EGP)', t: 'number', r: 1 }, { k: 'stay_available', l: 'Offers clinic stay', t: 'check' }, { k: 'stay_price', l: 'Stay price per night (EGP)', t: 'number' }],
  trainers: [{ k: 'name', l: 'Trainer name', r: 1 }, { k: 'pet_type', l: 'Pet type', t: 'select', o: ['Dog', 'Cat', 'Other'] }, { k: 'specialty', l: 'Specialty' }, { k: 'description', l: 'Description', t: 'textarea' }, { k: 'phone', l: 'Phone' }, { k: 'price', l: 'Price per session (EGP)', t: 'number', r: 1 }]
};
function adminForm(tab, id) {
  const row = id ? AR.find(r => r.id === id) : { is_available: 1, is_active: 1 };
  formModal((id ? 'Edit ' : 'Add ') + tab.replace(/s$/, ''), F[tab], row, async o => { await api('/admin/' + tab + (id ? '/' + id : ''), id ? 'PUT' : 'POST', o); toast('Saved'); adminPage(tab); });
}
async function adminDel(tab, id) {
  if (!confirm('Delete this item? This cannot be undone.')) return;
  try { await api(`/admin/${tab}/${id}`, 'DELETE'); toast('Deleted'); adminPage(tab); } catch (e) { toast(e.message, 1); }
}
async function careForm() {
  const bs = (await api('/admin/bookings')).filter(b => ['Pending', 'Confirmed', 'Checked In', 'In Stay'].includes(b.status));
  if (!bs.length) return toast('No active bookings to add care times to', 1);
  formModal('Add care time', [{ k: 'booking', l: 'Booking', t: 'select', o: bs.map(b => `${b.id} · ${b.pet} (${b.room})`) }, { k: 'care_type', l: 'Care type', t: 'select', o: CARE }, { k: 'schedule_time', l: 'Time', t: 'time', r: 1 }, { k: 'notes', l: 'Notes', t: 'textarea' }], null,
    async o => { await api('/admin/care', 'POST', { booking_id: parseInt(o.booking), care_type: o.care_type, schedule_time: o.schedule_time, notes: o.notes }); toast('Care time added'); adminPage('care'); });
}

// ---------- Customer: profile, pets, care ----------
async function editProfile() {
  const me = await api('/me');
  formModal('Edit my profile', [{ k: 'name', l: 'Full name', r: 1 }, { k: 'phone', l: 'Phone' }, { k: 'password', l: 'New password (leave empty to keep)', t: 'password' }], me,
    async o => { const d = await api('/me', 'PUT', o); token = d.token; user = d.user; localStorage.token = token; localStorage.user = JSON.stringify(user); toast('Profile updated'); nav(); account(); });
}
function editPet(id) {
  formModal('Edit pet', [{ k: 'name', l: 'Name', r: 1 }, { k: 'type', l: 'Type', t: 'select', o: ['Dog', 'Cat', 'Rabbit', 'Bird', 'Other'] }, { k: 'breed', l: 'Breed' }, { k: 'age', l: 'Age', t: 'number' }, { k: 'special_instructions', l: 'Special care instructions', t: 'textarea' }], PETS.find(p => p.id === id),
    async o => { await api('/pets/' + id, 'PUT', o); toast('Pet updated'); account(); });
}
async function careModal(bid) {
  document.querySelectorAll('.ov').forEach(o => o.remove());
  const c = await api(`/bookings/${bid}/care`), m = document.createElement('div'); m.className = 'ov';
  m.innerHTML = `<div class="md"><button class="x" onclick="this.closest('.ov').remove()">×</button><h3>Care schedule – booking #${bid}</h3>${c.map(x => `<div class="ln"><span><b>${x.schedule_time.slice(0, 5)}</b> ${esc(x.care_type)} ${esc(x.notes || '')}</span><a href="#" onclick="delCare(${x.id},${bid});return false" style="color:#b3392f">Remove</a></div>`).join('') || '<p class="mut">No care times yet. Add feeding or medication times for the staff.</p>'}<br><button class="btn full" onclick="addCare(${bid})">Add care time</button></div>`;
  document.body.appendChild(m);
}
function addCare(bid) {
  formModal('Add care time', [{ k: 'care_type', l: 'Care type', t: 'select', o: CARE }, { k: 'schedule_time', l: 'Time', t: 'time', r: 1 }, { k: 'notes', l: 'Notes (dose, portion…)', t: 'textarea' }], null,
    async o => { await api(`/bookings/${bid}/care`, 'POST', o); toast('Care time added'); setTimeout(() => careModal(bid), 50); });
}
async function delCare(id, bid) { try { await api('/care/' + id, 'DELETE'); careModal(bid); } catch (e) { toast(e.message, 1); } }

window.addEventListener('hashchange', route); route();
