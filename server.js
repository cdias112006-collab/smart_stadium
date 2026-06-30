// ============================================================
//  STADIUMDB — Backend  (server.js)
//  node server.js
// ============================================================
const express = require('express');
const mysql   = require('mysql2/promise');
const cors    = require('cors');
const crypto  = require('crypto');
const path    = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const DB = {
  host:     process.env.DB_HOST || 'localhost',
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'caroldias',        // ← your MySQL password
  database: process.env.DB_NAME || 'stadium_db',
  waitForConnections: true, connectionLimit: 10
};
const pool = mysql.createPool(DB);
const q = (sql, p) => pool.execute(sql, p);

const genId = (pfx) => `${pfx}${Date.now().toString().slice(-6)}`;

// ── STADIUMS ─────────────────────────────────────────────────
app.get('/api/stadiums', async (_, res) => {
  const [r] = await q('SELECT * FROM stadiums');
  res.json(r);
});

// ── EVENTS ───────────────────────────────────────────────────
app.get('/api/events', async (_, res) => {
  const [r] = await q('SELECT e.*,s.name AS stadium_name FROM events e JOIN stadiums s ON s.stadium_id=e.stadium_id ORDER BY e.event_date');
  res.json(r);
});
app.post('/api/events', async (req, res) => {
  const { name, event_date, event_time, sport, stadium_id, base_price, status } = req.body;
  const [r] = await q('INSERT INTO events (name,event_date,event_time,sport,stadium_id,base_price,status) VALUES (?,?,?,?,?,?,?)',
    [name, event_date, event_time, sport||'Cricket', stadium_id, base_price||500, status||'upcoming']);
  res.json({ event_id: r.insertId });
});
app.put('/api/events/:id', async (req, res) => {
  const { name, event_date, event_time, sport, base_price, status } = req.body;
  await q('UPDATE events SET name=?,event_date=?,event_time=?,sport=?,base_price=?,status=? WHERE event_id=?',
    [name, event_date, event_time, sport, base_price, status, req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/events/:id', async (req, res) => {
  await q('DELETE FROM events WHERE event_id=?', [req.params.id]);
  res.json({ ok: true });
});

// ── SEATS ────────────────────────────────────────────────────
app.get('/api/seats', async (req, res) => {
  const { event_id } = req.query;
  const [seats] = await q('SELECT * FROM seats ORDER BY row_label, seat_number');
  if (!event_id) return res.json(seats);
  const [bk] = await q('SELECT seat_id FROM bookings WHERE event_id=? AND status != "cancelled"', [event_id]);
  const bookedIds = new Set(bk.map(b => b.seat_id));
  const [ev] = await q('SELECT base_price FROM events WHERE event_id=?', [event_id]);
  const bp = ev[0]?.base_price || 500;
  res.json(seats.map(s => ({
    ...s,
    booked: bookedIds.has(s.seat_id),
    price: Math.round(bp * s.multiplier)
  })));
});

// ── BOOKINGS ─────────────────────────────────────────────────
app.get('/api/bookings', async (req, res) => {
  const { event_id } = req.query;
  const sql = `SELECT b.*,e.name AS event_name,s.section,s.row_label,s.seat_number
    FROM bookings b JOIN events e ON e.event_id=b.event_id JOIN seats s ON s.seat_id=b.seat_id
    ${event_id ? 'WHERE b.event_id=?' : ''} ORDER BY b.booked_at DESC`;
  const [r] = event_id ? await q(sql,[event_id]) : await q(sql);
  res.json(r);
});
app.post('/api/bookings', async (req, res) => {
  const { event_id, seat_id, guest_name, phone, email, amount } = req.body;
  const id = genId('BK');
  const qr = `QR-${id}-${seat_id}`;
  await q('INSERT INTO bookings (booking_id,event_id,seat_id,guest_name,phone,email,amount,qr_code) VALUES (?,?,?,?,?,?,?,?)',
    [id, event_id, seat_id, guest_name, phone, email, amount, qr]);
  res.json({ booking_id: id, qr_code: qr });
});
app.put('/api/bookings/:id/checkin', async (req, res) => {
  await q('UPDATE bookings SET check_in=NOW(),status="used" WHERE booking_id=?', [req.params.id]);
  res.json({ ok: true });
});
app.put('/api/bookings/:id/cancel', async (req, res) => {
  await q('UPDATE bookings SET status="cancelled" WHERE booking_id=?', [req.params.id]);
  res.json({ ok: true });
});
app.get('/api/bookings/scan/:code', async (req, res) => {
  const [[r]] = await q(
    `SELECT b.*,e.name AS event_name,s.section,s.seat_number FROM bookings b
     JOIN events e ON e.event_id=b.event_id JOIN seats s ON s.seat_id=b.seat_id
     WHERE b.qr_code=? OR b.booking_id=?`, [req.params.code, req.params.code]);
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json(r);
});

// ── PARKING ──────────────────────────────────────────────────
app.get('/api/parking', async (req, res) => {
  const { event_id } = req.query;
  const sql = `SELECT p.*,e.name AS event_name FROM parking p JOIN events e ON e.event_id=p.event_id ${event_id?'WHERE p.event_id=?':''}`;
  const [r] = event_id ? await q(sql,[event_id]) : await q(sql);
  res.json(r);
});
app.post('/api/parking', async (req, res) => {
  const { event_id, zone, vehicle_type, vehicle_plate, booked_by } = req.body;
  const [ex] = await q('SELECT COUNT(*) AS c FROM parking WHERE zone=? AND event_id=?', [zone, event_id]);
  const slot = `${zone}-${String(ex[0].c+1).padStart(2,'0')}`;
  const id = genId('P');
  await q('INSERT INTO parking (alloc_id,event_id,zone,slot,vehicle_type,vehicle_plate,booked_by) VALUES (?,?,?,?,?,?,?)',
    [id, event_id, zone, slot, vehicle_type||'4-Wheeler', vehicle_plate, booked_by]);
  res.json({ alloc_id: id, slot });
});
app.delete('/api/parking/:id', async (req, res) => {
  await q('DELETE FROM parking WHERE alloc_id=?', [req.params.id]);
  res.json({ ok: true });
});

// ── FOOD ─────────────────────────────────────────────────────
app.get('/api/food', async (req, res) => {
  const { event_id } = req.query;
  const sql = `SELECT * FROM food_orders ${event_id?'WHERE event_id=?':''} ORDER BY ordered_at DESC`;
  const [r] = event_id ? await q(sql,[event_id]) : await q(sql);
  res.json(r.map(o => {
    let items = o.items;
    if (typeof items === 'string') { try { items = JSON.parse(items); } catch(_) { items = []; } }
    if (!Array.isArray(items)) items = [];
    return { ...o, items };
  }));
});
app.post('/api/food', async (req, res) => {
  const { event_id, seat_id, items, amount } = req.body;
  const id = genId('FO');
  await q('INSERT INTO food_orders (order_id,event_id,seat_id,items,amount) VALUES (?,?,?,?,?)',
    [id, event_id, seat_id, JSON.stringify(items), amount]);
  res.json({ order_id: id });
});
app.put('/api/food/:id/status', async (req, res) => {
  await q('UPDATE food_orders SET status=? WHERE order_id=?', [req.body.status, req.params.id]);
  res.json({ ok: true });
});

// ── CROWD ────────────────────────────────────────────────────
app.get('/api/crowd', async (req, res) => {
  const { event_id } = req.query;
  const sql = event_id
    ? `SELECT gate,
         MAX(entry_count) AS entry_count,
         MAX(exit_count)  AS exit_count,
         MAX(recorded_at) AS recorded_at,
         CASE
           WHEN MAX(entry_count) > 12000 THEN 'Critical'
           WHEN MAX(entry_count) > 8000  THEN 'High'
           WHEN MAX(entry_count) > 4000  THEN 'Medium'
           ELSE 'Low' END AS density,
         event_id
       FROM crowd_flow WHERE event_id=? GROUP BY gate ORDER BY gate`
    : `SELECT gate,
         MAX(entry_count) AS entry_count,
         MAX(exit_count)  AS exit_count,
         MAX(recorded_at) AS recorded_at,
         CASE
           WHEN MAX(entry_count) > 12000 THEN 'Critical'
           WHEN MAX(entry_count) > 8000  THEN 'High'
           WHEN MAX(entry_count) > 4000  THEN 'Medium'
           ELSE 'Low' END AS density
       FROM crowd_flow GROUP BY gate ORDER BY gate`;
  const [r] = event_id ? await q(sql, [event_id]) : await q(sql);
  res.json(r);
});
app.post('/api/crowd', async (req, res) => {
  const { event_id, gate, entry_count, exit_count, density } = req.body;
  const [r] = await q('INSERT INTO crowd_flow (event_id,gate,entry_count,exit_count,density) VALUES (?,?,?,?,?)',
    [event_id, gate, entry_count||0, exit_count||0, density||'Low']);
  res.json({ flow_id: r.insertId });
});
app.put('/api/crowd/simulate', async (req, res) => {
  await q(`UPDATE crowd_flow SET
    entry_count = entry_count + FLOOR(RAND()*200),
    exit_count  = exit_count  + FLOOR(RAND()*50),
    density = CASE
      WHEN entry_count > 12000 THEN 'Critical'
      WHEN entry_count > 8000  THEN 'High'
      WHEN entry_count > 4000  THEN 'Medium'
      ELSE 'Low' END`);
  res.json({ ok: true });
});

// ── STAFF ────────────────────────────────────────────────────
app.get('/api/staff', async (_, res) => {
  const [r] = await q('SELECT * FROM staff');
  res.json(r);
});
app.post('/api/staff', async (req, res) => {
  const { name, role, gate, shift, status } = req.body;
  const id = genId('ST');
  await q('INSERT INTO staff (staff_id,name,role,gate,shift,status) VALUES (?,?,?,?,?,?)',
    [id, name, role, gate, shift||'Evening', status||'on-duty']);
  res.json({ staff_id: id });
});
app.put('/api/staff/:id/toggle', async (req, res) => {
  await q("UPDATE staff SET status = CASE WHEN status='on-duty' THEN 'break' ELSE 'on-duty' END WHERE staff_id=?", [req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/staff/:id', async (req, res) => {
  await q('DELETE FROM staff WHERE staff_id=?', [req.params.id]);
  res.json({ ok: true });
});

// ── INCIDENTS ────────────────────────────────────────────────
app.get('/api/incidents', async (_, res) => {
  const [r] = await q('SELECT i.*,e.name AS event_name FROM incidents i JOIN events e ON e.event_id=i.event_id ORDER BY i.occurred_at DESC');
  res.json(r);
});
app.post('/api/incidents', async (req, res) => {
  const { event_id, type, gate, severity, description } = req.body;
  const id = genId('INC');
  await q('INSERT INTO incidents (incident_id,event_id,type,gate,severity,description) VALUES (?,?,?,?,?,?)',
    [id, event_id, type, gate, severity||'Medium', description]);
  res.json({ incident_id: id });
});
app.put('/api/incidents/:id/resolve', async (req, res) => {
  await q("UPDATE incidents SET status='resolved' WHERE incident_id=?", [req.params.id]);
  res.json({ ok: true });
});

// ── DASHBOARD ────────────────────────────────────────────────
app.get('/api/dashboard', async (_, res) => {
  const [[bkRev]]  = await q("SELECT COALESCE(SUM(amount),0) AS t FROM bookings WHERE status!='cancelled'");
  const [[foodRev]]= await q('SELECT COALESCE(SUM(amount),0) AS t FROM food_orders');
  const [[bkCnt]]  = await q("SELECT COUNT(*) AS c FROM bookings WHERE status='confirmed'");
  const [[checkIn]]= await q('SELECT COUNT(*) AS c FROM bookings WHERE check_in IS NOT NULL');
  const [[liveEv]] = await q("SELECT COUNT(*) AS c FROM events WHERE status='ongoing'");
  const [[parked]] = await q("SELECT COUNT(*) AS c FROM parking WHERE status='booked'");
  const [[incAct]] = await q("SELECT COUNT(*) AS c FROM incidents WHERE status='active'");
  const [recentBk] = await q(`SELECT b.*,e.name AS event_name FROM bookings b JOIN events e ON e.event_id=b.event_id ORDER BY b.booked_at DESC LIMIT 5`);
  const [crowd]    = await q(`SELECT gate,
      MAX(entry_count) AS entry_count, MAX(exit_count) AS exit_count,
      CASE WHEN MAX(entry_count)>12000 THEN 'Critical' WHEN MAX(entry_count)>8000 THEN 'High'
           WHEN MAX(entry_count)>4000 THEN 'Medium' ELSE 'Low' END AS density
    FROM crowd_flow GROUP BY gate ORDER BY gate LIMIT 4`);
  const [upEvents] = await q("SELECT e.*,s.name AS stadium_name FROM events e JOIN stadiums s ON s.stadium_id=e.stadium_id WHERE e.status!='completed' ORDER BY e.event_date LIMIT 5");
  const [foodPipe] = await q('SELECT status, COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS rev FROM food_orders GROUP BY status');
  res.json({
    stats: {
      total_revenue: Number(bkRev.t) + Number(foodRev.t),
      booking_revenue: Number(bkRev.t),
      food_revenue: Number(foodRev.t),
      confirmed_bookings: bkCnt.c,
      checked_in: checkIn.c,
      live_events: liveEv.c,
      parked_vehicles: parked.c,
      active_incidents: incAct.c
    },
    recent_bookings: recentBk,
    crowd_flow: crowd,
    upcoming_events: upEvents,
    food_pipeline: foodPipe
  });
});

// ── REPORTS ──────────────────────────────────────────────────
app.get('/api/reports', async (_, res) => {
  const [[bkRev]]  = await q("SELECT COALESCE(SUM(amount),0) AS t FROM bookings WHERE status!='cancelled'");
  const [[foodRev]]= await q('SELECT COALESCE(SUM(amount),0) AS t FROM food_orders');
  const [[pkRev]]  = await q('SELECT COUNT(*)*100 AS t FROM parking');
  const [[totalBk]]= await q('SELECT COUNT(*) AS c FROM bookings');
  const [[chkIn]]  = await q('SELECT COUNT(*) AS c FROM bookings WHERE check_in IS NOT NULL');
  const [secRev]   = await q(`SELECT s.section, COUNT(b.booking_id) AS cnt, COALESCE(SUM(b.amount),0) AS rev
    FROM seats s LEFT JOIN bookings b ON b.seat_id=s.seat_id AND b.status!='cancelled'
    GROUP BY s.section`);
  const [evRev]    = await q(`SELECT e.name, COUNT(b.booking_id) AS cnt, COALESCE(SUM(b.amount),0) AS rev
    FROM events e LEFT JOIN bookings b ON b.event_id=e.event_id GROUP BY e.event_id,e.name`);
  const [foodAnal] = await q('SELECT status, COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS rev FROM food_orders GROUP BY status');
  const [stadUtil] = await q(`SELECT st.*, COUNT(DISTINCT b.booking_id) AS total_bookings
    FROM stadiums st
    LEFT JOIN events e ON e.stadium_id=st.stadium_id
    LEFT JOIN bookings b ON b.event_id=e.event_id
    GROUP BY st.stadium_id`);
  res.json({
    totals: { booking: Number(bkRev.t), food: Number(foodRev.t), parking: Number(pkRev.t),
      grand: Number(bkRev.t)+Number(foodRev.t)+Number(pkRev.t),
      total_bookings: totalBk.c, check_in_rate: totalBk.c > 0 ? Math.round((chkIn.c/totalBk.c)*100) : 0 },
    section_revenue: secRev,
    event_revenue: evRev,
    food_analysis: foodAnal,
    stadium_utilization: stadUtil
  });
});

app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n⚡ StadiumDB server → http://localhost:${PORT}\n`));