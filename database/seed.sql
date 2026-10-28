INSERT INTO rooms (name,room_type,suits,description,price_per_night) VALUES
('Small Pets Corner','Standard','all','A calm, safe space for rabbits, birds, and other small pets.',150),
('Cat Condo','Standard','Cat','A quiet multi-level condo with climbing shelves and a sunny window.',200),
('Cozy Standard','Standard','Dog','A clean, comfortable room for small and medium dogs, with a soft bed and daily cleaning.',250),
('Cat Suite','Deluxe','Cat','A spacious cat suite with a private play area and window perch.',350),
('Deluxe Suite','Deluxe','Dog','A spacious suite with a large bed, a window view, and a private play corner.',450),
('Luxury Villa','Luxury','all','Our largest room with air conditioning, a camera for owners, and extra play time.',700);

INSERT INTO services (name,description,price) VALUES
('Grooming','Bath, brushing, nail trimming, and ear cleaning.',200),
('Daily Walking','A daily walk with a trained staff member.',60),
('Special Feeding','Custom feeding schedule and portions prepared by staff.',40),
('Medication Reminder','Staff give medication at the times you set.',30),
('Play Time','Extra one-on-one play and cuddle time.',50),
('Daily Photo Update','Receive a photo of your pet every day.',20);

INSERT INTO vets (name,clinic,specialty,description,pet_types,address,phone,price,stay_available,stay_price) VALUES
('Dr. Mohamed','Happy Paws Clinic','General practice','Friendly vet for check-ups, vaccines, and everyday care.','Dog,Cat','12 Nile Street, Giza','01000000001',300,0,0),
('Dr. Malak','City Vet Center','Surgery','Experienced surgeon. Offers overnight recovery stay at the clinic.','Dog,Cat','5 Tahrir Square, Cairo','01200000002',500,1,350),
('Dr. Adam','City Vet Center','Surgery','Experienced surgeon. Offers overnight recovery stay at the clinic.','Dog,Cat','5 Tahrir Square, Cairo','01200000002',500,1,350);

INSERT INTO trainers (name,pet_type,specialty,description,phone,price) VALUES
('JOE','Dog','Obedience & behavior','Teaches commands, leash manners, and good behavior at home.','01100000003',300),
('Mostafa','Cat','Cat behavior','Litter habits, scratching, and calm adaptation to home life.','01500000004',250),
('Ramos','Cat','Cat behavior','Litter habits, scratching, and calm adaptation to home life.','01500000004',250);

INSERT INTO offers (title,description,discount_percent,code,applies_to) VALUES
('Welcome offer','Get 10% off any booking when you sign up.',10,'WELCOME10','all'),
('Long-stay deal','Save 15% on your pet hotel stay.',15,'STAY15','hotel'),
('Training special','Save 20% on a training session.',20,'PAWTRAIN','training');
