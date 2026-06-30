-- ============================================================
--  STADIUMDB — Full Schema
--  Run: mysql -u root -p < schema.sql
-- ============================================================
CREATE DATABASE IF NOT EXISTS stadium_db;
USE stadium_db;

-- ─── STADIUMS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stadiums (
  stadium_id   INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(120) NOT NULL,
  city         VARCHAR(80)  NOT NULL,
  capacity     INT          DEFAULT 50000,
  sections     INT          DEFAULT 8,
  parking_slots INT         DEFAULT 2000,
  status       ENUM('active','inactive') DEFAULT 'active'
);

-- ─── EVENTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  event_id    INT AUTO_INCREMENT PRIMARY KEY,
  stadium_id  INT NOT NULL,
  name        VARCHAR(120) NOT NULL,
  event_date  DATE         NOT NULL,
  event_time  TIME         NOT NULL,
  sport       VARCHAR(50)  DEFAULT 'Cricket',
  status      ENUM('upcoming','ongoing','completed','cancelled') DEFAULT 'upcoming',
  base_price  DECIMAL(8,2) NOT NULL DEFAULT 500,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (stadium_id) REFERENCES stadiums(stadium_id) ON DELETE CASCADE
);

-- ─── SEATS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seats (
  seat_id     VARCHAR(10) PRIMARY KEY,   -- e.g. A1, B12
  row_label   VARCHAR(5)  NOT NULL,
  seat_number INT         NOT NULL,
  section     ENUM('VIP','Premium','Standard','Economy') NOT NULL,
  multiplier  DECIMAL(4,2) NOT NULL DEFAULT 1.0
);

-- ─── BOOKINGS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  booking_id  VARCHAR(20) PRIMARY KEY,
  event_id    INT NOT NULL,
  seat_id     VARCHAR(10) NOT NULL,
  guest_name  VARCHAR(100) NOT NULL,
  phone       VARCHAR(20),
  email       VARCHAR(100),
  amount      DECIMAL(8,2) NOT NULL,
  qr_code     VARCHAR(100) UNIQUE,
  status      ENUM('confirmed','cancelled','used') DEFAULT 'confirmed',
  check_in    DATETIME NULL,
  booked_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
  FOREIGN KEY (seat_id)  REFERENCES seats(seat_id)
);

-- ─── PARKING ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parking (
  alloc_id    VARCHAR(20) PRIMARY KEY,
  event_id    INT NOT NULL,
  zone        ENUM('A','B','C','D') NOT NULL,
  slot        VARCHAR(10) NOT NULL,
  vehicle_type ENUM('2-Wheeler','4-Wheeler','Bus/Coach','Handicapped') DEFAULT '4-Wheeler',
  vehicle_plate VARCHAR(20),
  booked_by   VARCHAR(100),
  status      ENUM('booked','available') DEFAULT 'booked',
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE
);

-- ─── FOOD ORDERS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS food_orders (
  order_id    VARCHAR(20) PRIMARY KEY,
  event_id    INT NOT NULL,
  seat_id     VARCHAR(10),
  items       JSON NOT NULL,
  amount      DECIMAL(8,2) NOT NULL,
  status      ENUM('pending','preparing','delivered') DEFAULT 'pending',
  ordered_at  DATE DEFAULT (CURDATE()),
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE
);

-- ─── CROWD FLOW ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crowd_flow (
  flow_id     INT AUTO_INCREMENT PRIMARY KEY,
  event_id    INT NOT NULL,
  gate        VARCHAR(50) NOT NULL,
  entry_count INT DEFAULT 0,
  exit_count  INT DEFAULT 0,
  density     ENUM('Low','Medium','High','Critical') DEFAULT 'Low',
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE
);

-- ─── STAFF ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff (
  staff_id    VARCHAR(20) PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  role        VARCHAR(50)  NOT NULL,
  gate        VARCHAR(50)  NOT NULL,
  shift       ENUM('Morning','Afternoon','Evening','Night') DEFAULT 'Evening',
  status      ENUM('on-duty','break','off-duty') DEFAULT 'on-duty'
);

-- ─── INCIDENTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incidents (
  incident_id VARCHAR(20) PRIMARY KEY,
  event_id    INT NOT NULL,
  type        VARCHAR(60)  NOT NULL,
  gate        VARCHAR(50)  NOT NULL,
  severity    ENUM('Low','Medium','High','Critical') DEFAULT 'Medium',
  description TEXT,
  status      ENUM('active','resolved') DEFAULT 'active',
  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE
);

-- ============================================================
--  SEED DATA
-- ============================================================
INSERT IGNORE INTO stadiums VALUES
  (1,'ArenaMax Stadium','Chennai',50000,8,2000,'active'),
  (2,'SportsPlex Arena','Mumbai',35000,6,1500,'active');

INSERT IGNORE INTO events VALUES
  (1,1,'IPL Finals 2026','2026-05-20','19:00:00','Cricket','upcoming',800,NOW()),
  (2,1,'Pro Kabaddi League','2026-05-15','18:00:00','Kabaddi','ongoing',400,NOW()),
  (3,2,'ISL Championship','2026-05-25','20:00:00','Football','upcoming',600,NOW()),
  (4,1,'Test Match Day 1','2026-04-10','09:30:00','Cricket','completed',500,NOW());

-- Seats: 8 rows × 20 cols
INSERT IGNORE INTO seats (seat_id,row_label,seat_number,section,multiplier) VALUES
  ('A1','A',1,'VIP',3.0),('A2','A',2,'VIP',3.0),('A3','A',3,'VIP',3.0),('A4','A',4,'VIP',3.0),('A5','A',5,'VIP',3.0),
  ('A6','A',6,'VIP',3.0),('A7','A',7,'VIP',3.0),('A8','A',8,'VIP',3.0),('A9','A',9,'VIP',3.0),('A10','A',10,'VIP',3.0),
  ('A11','A',11,'VIP',3.0),('A12','A',12,'VIP',3.0),('A13','A',13,'VIP',3.0),('A14','A',14,'VIP',3.0),('A15','A',15,'VIP',3.0),
  ('A16','A',16,'VIP',3.0),('A17','A',17,'VIP',3.0),('A18','A',18,'VIP',3.0),('A19','A',19,'VIP',3.0),('A20','A',20,'VIP',3.0),
  ('B1','B',1,'VIP',3.0),('B2','B',2,'VIP',3.0),('B3','B',3,'VIP',3.0),('B4','B',4,'VIP',3.0),('B5','B',5,'VIP',3.0),
  ('B6','B',6,'VIP',3.0),('B7','B',7,'VIP',3.0),('B8','B',8,'VIP',3.0),('B9','B',9,'VIP',3.0),('B10','B',10,'VIP',3.0),
  ('B11','B',11,'VIP',3.0),('B12','B',12,'VIP',3.0),('B13','B',13,'VIP',3.0),('B14','B',14,'VIP',3.0),('B15','B',15,'VIP',3.0),
  ('B16','B',16,'VIP',3.0),('B17','B',17,'VIP',3.0),('B18','B',18,'VIP',3.0),('B19','B',19,'VIP',3.0),('B20','B',20,'VIP',3.0),
  ('C1','C',1,'Premium',2.0),('C2','C',2,'Premium',2.0),('C3','C',3,'Premium',2.0),('C4','C',4,'Premium',2.0),('C5','C',5,'Premium',2.0),
  ('C6','C',6,'Premium',2.0),('C7','C',7,'Premium',2.0),('C8','C',8,'Premium',2.0),('C9','C',9,'Premium',2.0),('C10','C',10,'Premium',2.0),
  ('C11','C',11,'Premium',2.0),('C12','C',12,'Premium',2.0),('C13','C',13,'Premium',2.0),('C14','C',14,'Premium',2.0),('C15','C',15,'Premium',2.0),
  ('C16','C',16,'Premium',2.0),('C17','C',17,'Premium',2.0),('C18','C',18,'Premium',2.0),('C19','C',19,'Premium',2.0),('C20','C',20,'Premium',2.0),
  ('D1','D',1,'Premium',2.0),('D2','D',2,'Premium',2.0),('D3','D',3,'Premium',2.0),('D4','D',4,'Premium',2.0),('D5','D',5,'Premium',2.0),
  ('D6','D',6,'Premium',2.0),('D7','D',7,'Premium',2.0),('D8','D',8,'Premium',2.0),('D9','D',9,'Premium',2.0),('D10','D',10,'Premium',2.0),
  ('D11','D',11,'Premium',2.0),('D12','D',12,'Premium',2.0),('D13','D',13,'Premium',2.0),('D14','D',14,'Premium',2.0),('D15','D',15,'Premium',2.0),
  ('D16','D',16,'Premium',2.0),('D17','D',17,'Premium',2.0),('D18','D',18,'Premium',2.0),('D19','D',19,'Premium',2.0),('D20','D',20,'Premium',2.0),
  ('E1','E',1,'Standard',1.5),('E2','E',2,'Standard',1.5),('E3','E',3,'Standard',1.5),('E4','E',4,'Standard',1.5),('E5','E',5,'Standard',1.5),
  ('E6','E',6,'Standard',1.5),('E7','E',7,'Standard',1.5),('E8','E',8,'Standard',1.5),('E9','E',9,'Standard',1.5),('E10','E',10,'Standard',1.5),
  ('E11','E',11,'Standard',1.5),('E12','E',12,'Standard',1.5),('E13','E',13,'Standard',1.5),('E14','E',14,'Standard',1.5),('E15','E',15,'Standard',1.5),
  ('E16','E',16,'Standard',1.5),('E17','E',17,'Standard',1.5),('E18','E',18,'Standard',1.5),('E19','E',19,'Standard',1.5),('E20','E',20,'Standard',1.5),
  ('F1','F',1,'Standard',1.5),('F2','F',2,'Standard',1.5),('F3','F',3,'Standard',1.5),('F4','F',4,'Standard',1.5),('F5','F',5,'Standard',1.5),
  ('F6','F',6,'Standard',1.5),('F7','F',7,'Standard',1.5),('F8','F',8,'Standard',1.5),('F9','F',9,'Standard',1.5),('F10','F',10,'Standard',1.5),
  ('F11','F',11,'Standard',1.5),('F12','F',12,'Standard',1.5),('F13','F',13,'Standard',1.5),('F14','F',14,'Standard',1.5),('F15','F',15,'Standard',1.5),
  ('F16','F',16,'Standard',1.5),('F17','F',17,'Standard',1.5),('F18','F',18,'Standard',1.5),('F19','F',19,'Standard',1.5),('F20','F',20,'Standard',1.5),
  ('G1','G',1,'Economy',1.0),('G2','G',2,'Economy',1.0),('G3','G',3,'Economy',1.0),('G4','G',4,'Economy',1.0),('G5','G',5,'Economy',1.0),
  ('G6','G',6,'Economy',1.0),('G7','G',7,'Economy',1.0),('G8','G',8,'Economy',1.0),('G9','G',9,'Economy',1.0),('G10','G',10,'Economy',1.0),
  ('G11','G',11,'Economy',1.0),('G12','G',12,'Economy',1.0),('G13','G',13,'Economy',1.0),('G14','G',14,'Economy',1.0),('G15','G',15,'Economy',1.0),
  ('G16','G',16,'Economy',1.0),('G17','G',17,'Economy',1.0),('G18','G',18,'Economy',1.0),('G19','G',19,'Economy',1.0),('G20','G',20,'Economy',1.0),
  ('H1','H',1,'Economy',1.0),('H2','H',2,'Economy',1.0),('H3','H',3,'Economy',1.0),('H4','H',4,'Economy',1.0),('H5','H',5,'Economy',1.0),
  ('H6','H',6,'Economy',1.0),('H7','H',7,'Economy',1.0),('H8','H',8,'Economy',1.0),('H9','H',9,'Economy',1.0),('H10','H',10,'Economy',1.0),
  ('H11','H',11,'Economy',1.0),('H12','H',12,'Economy',1.0),('H13','H',13,'Economy',1.0),('H14','H',14,'Economy',1.0),('H15','H',15,'Economy',1.0),
  ('H16','H',16,'Economy',1.0),('H17','H',17,'Economy',1.0),('H18','H',18,'Economy',1.0),('H19','H',19,'Economy',1.0),('H20','H',20,'Economy',1.0);

INSERT IGNORE INTO bookings VALUES
  ('BK001',1,'A3','Ravi Kumar','9876543210','ravi@email.com',2400,'QR-BK001-A3-IPL','confirmed',NULL,NOW()),
  ('BK002',2,'C7','Priya Singh','9812345678','priya@email.com',600,'QR-BK002-C7-KBD','confirmed','2026-05-15 17:42:00',NOW()),
  ('BK003',1,'B12','Arjun Mehta','9745632189','arjun@email.com',1600,'QR-BK003-B12-IPL','confirmed',NULL,NOW());

INSERT IGNORE INTO parking VALUES
  ('P001',1,'A','A-12','4-Wheeler','TN01AB1234','Ravi Kumar','booked'),
  ('P002',2,'B','B-45','2-Wheeler','TN05XY9876','Priya Singh','booked'),
  ('P003',1,'A','A-23','4-Wheeler','MH04CD5678','Arjun Mehta','booked');

INSERT IGNORE INTO food_orders VALUES
  ('FO001',1,'A3','["Biryani","Cold Drink"]',320,'delivered',CURDATE()),
  ('FO002',2,'C7','["Popcorn","Burger","Juice"]',280,'preparing',CURDATE()),
  ('FO003',1,'B12','["Sandwich","Water","Chips"]',180,'pending',CURDATE());

INSERT IGNORE INTO crowd_flow (event_id,gate,entry_count,exit_count,density) VALUES
  (2,'North Gate',2340,120,'High'),
  (2,'South Gate',1870,95,'Medium'),
  (2,'East Gate',3120,200,'Critical'),
  (2,'West Gate',1450,80,'Low');

INSERT IGNORE INTO staff VALUES
  ('ST001','Muthu Raj','Gate Manager','North Gate','Evening','on-duty'),
  ('ST002','Anitha Devi','Security','East Gate','Evening','on-duty'),
  ('ST003','Suresh K','Parking Attendant','Parking A','Evening','on-duty'),
  ('ST004','Kavitha R','Food Counter','Zone 2','Evening','break');

INSERT IGNORE INTO incidents VALUES
  ('INC001',2,'Overcrowding','East Gate','High','East Gate approaching critical density','active',NOW()),
  ('INC002',2,'Medical','Section C','Medium','Spectator feeling unwell, medics dispatched','resolved',NOW());

SELECT 'StadiumDB ready ✓' AS status;