const mysql = require('mysql2/promise');
const readline = require('readline');

const DB = {
  host:     process.env.DB_HOST || 'localhost',
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'caroldias',          // ← set your MySQL password
  database: process.env.DB_NAME || 'stadium_db'
};

// ── Colours ───────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
  white:  '\x1b[37m',
  dim:    '\x1b[2m'
};
const c  = (col, txt) => `${C[col]}${txt}${C.reset}`;
const hdr = txt => console.log(`\n${c('cyan',c('bold','╔══ '+txt+' ══'))}`);
const row = obj => {
  Object.entries(obj).forEach(([k,v]) =>
    console.log(`  ${c('dim',k.padEnd(20))} ${c('white', v ?? '')}`)
  );
  console.log(c('dim','  ' + '─'.repeat(40)));
};

// ── Prompt helper ─────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(res => rl.question(c('yellow', '  ? ') + q + ' ', res));

async function main() {
  const conn = await mysql.createConnection(DB);
  const [cmd, sub, id] = process.argv.slice(2);

  console.log(c('cyan', c('bold',
    '\n  🏟️  STADIUM OPS — Command Line Interface\n')));

  try {
    if (!cmd || cmd === 'help') return showHelp();

    // ── LIST ────────────────────────────────────────────────
    if (cmd === 'list') {
      if (!sub) { showHelp(); return; }

      if (sub === 'events') {
        hdr('EVENTS');
        const [rows] = await conn.execute('SELECT * FROM events ORDER BY event_date');
        rows.forEach(row);

      } else if (sub === 'bookings') {
        hdr('BOOKINGS');
        const event_id = id;
        const sql = event_id
          ? `SELECT b.booking_id,e.name AS event,s.section,s.row_num,s.seat_num,
                    b.customer,b.phone,b.price_paid,b.status,b.booked_at
             FROM bookings b JOIN seats s ON s.seat_id=b.seat_id
             JOIN events e ON e.event_id=b.event_id WHERE b.event_id=?`
          : `SELECT b.booking_id,e.name AS event,s.section,s.row_num,s.seat_num,
                    b.customer,b.phone,b.price_paid,b.status
             FROM bookings b JOIN seats s ON s.seat_id=b.seat_id
             JOIN events e ON e.event_id=b.event_id ORDER BY b.booked_at DESC LIMIT 20`;
        const [rows] = event_id
          ? await conn.execute(sql, [event_id])
          : await conn.execute(sql);
        if (!rows.length) return console.log(c('yellow','  No bookings found.'));
        rows.forEach(row);

      } else if (sub === 'seats') {
        hdr('SEAT AVAILABILITY');
        const event_id = id || 1;
        const [rows] = await conn.execute(
          `SELECT s.section,s.row_num,s.seat_num,s.base_price,
                  CASE WHEN b.booking_id IS NULL THEN 'available' ELSE b.status END AS state,
                  b.customer
           FROM seats s
           LEFT JOIN bookings b ON b.seat_id=s.seat_id AND b.event_id=?
           ORDER BY s.section,s.row_num,s.seat_num`, [event_id]);
        rows.forEach(r => {
          const colour = r.state==='available' ? 'green' : r.state==='confirmed' ? 'red' : 'yellow';
          console.log(`  ${r.section}-${r.row_num}${r.seat_num}  ₹${r.base_price}  ` +
            c(colour, r.state.toUpperCase()) + (r.customer ? `  (${r.customer})` : ''));
        });

      } else if (sub === 'crowd') {
        hdr('CROWD SUMMARY');
        const [rows] = await conn.execute('SELECT * FROM v_crowd_summary');
        rows.forEach(row);

      } else if (sub === 'parking') {
        hdr('PARKING');
        const event_id = id;
        const sql = event_id
          ? 'SELECT * FROM parking WHERE event_id=? ORDER BY zone,slot_num'
          : 'SELECT * FROM parking ORDER BY event_id,zone,slot_num';
        const [rows] = event_id
          ? await conn.execute(sql,[event_id])
          : await conn.execute(sql);
        rows.forEach(row);

      } else if (sub === 'food') {
        hdr('FOOD ORDERS');
        const event_id = id;
        const sql = event_id
          ? 'SELECT * FROM food_orders WHERE event_id=? ORDER BY ordered_at DESC'
          : 'SELECT * FROM food_orders ORDER BY ordered_at DESC LIMIT 20';
        const [rows] = event_id
          ? await conn.execute(sql,[event_id])
          : await conn.execute(sql);
        rows.forEach(row);
      }

    // ── ADD ─────────────────────────────────────────────────
    } else if (cmd === 'add') {
      if (sub === 'event') {
        hdr('ADD NEW EVENT');
        const name       = await ask('Event name:');
        const event_date = await ask('Date & time (YYYY-MM-DD HH:MM):');
        const venue      = await ask('Venue [Main Stadium]:') || 'Main Stadium';
        const status     = await ask('Status [scheduled]:')   || 'scheduled';
        const [r] = await conn.execute(
          'INSERT INTO events (name,event_date,venue,status) VALUES (?,?,?,?)',
          [name, event_date, venue, status]);
        console.log(c('green', `\n  ✓ Event added! ID = ${r.insertId}`));

      } else if (sub === 'booking') {
        hdr('ADD BOOKING');
        // show events
        const [evts] = await conn.execute('SELECT event_id,name FROM events WHERE status="scheduled"');
        console.log('  Events:'); evts.forEach(e => console.log(`    [${e.event_id}] ${e.name}`));
        const event_id = await ask('Event ID:');
        // show available seats
        const [avail] = await conn.execute(
          `SELECT s.seat_id,s.section,s.row_num,s.seat_num,s.base_price
           FROM seats s
           LEFT JOIN bookings b ON b.seat_id=s.seat_id AND b.event_id=? AND b.status='confirmed'
           WHERE b.booking_id IS NULL ORDER BY s.section,s.row_num LIMIT 15`, [event_id]);
        console.log('  Available seats:');
        avail.forEach(s => console.log(`    [${s.seat_id}] ${s.section}-${s.row_num}${s.seat_num}  ₹${s.base_price}`));
        const seat_id  = await ask('Seat ID:');
        const customer = await ask('Customer name:');
        const phone    = await ask('Phone:');
        const [[seat]] = await conn.execute('SELECT base_price FROM seats WHERE seat_id=?',[seat_id]);
        const price    = await ask(`Price paid [₹${seat.base_price}]:`);
        const crypto   = require('crypto');
        const qr       = crypto.createHash('sha256')
          .update(`EVT${event_id}-SEAT${seat_id}-${Date.now()}`).digest('hex');
        const [r] = await conn.execute(
          'INSERT INTO bookings (event_id,seat_id,customer,phone,qr_code,price_paid) VALUES (?,?,?,?,?,?)',
          [event_id, seat_id, customer, phone, qr, price || seat.base_price]);
        console.log(c('green', `\n  ✓ Booking confirmed! ID=${r.insertId}`));
        console.log(c('cyan',  `  QR Code: ${qr.substring(0,32)}...`));

      } else if (sub === 'crowd') {
        hdr('LOG CROWD');
        const event_id  = await ask('Event ID:');
        const gate      = await ask('Gate (e.g. Gate-1):');
        const direction = await ask('Direction (entry/exit):');
        const count     = await ask('Count:');
        const [r] = await conn.execute(
          'INSERT INTO crowd_flow (event_id,gate,direction,count) VALUES (?,?,?,?)',
          [event_id, gate, direction, count]);
        console.log(c('green', `\n  ✓ Crowd data logged! ID=${r.insertId}`));

      } else if (sub === 'parking') {
        hdr('ALLOCATE PARKING');
        const event_id  = await ask('Event ID:');
        const zone      = await ask('Zone (A/B/C/VIP):');
        const slot_num  = await ask('Slot number:');
        const vehicle   = await ask('Vehicle number:');
        await conn.execute(
          `INSERT INTO parking (event_id,zone,slot_num,vehicle_no,status,allocated_at)
           VALUES (?,?,?,?,'occupied',NOW())
           ON DUPLICATE KEY UPDATE vehicle_no=?,status='occupied',allocated_at=NOW()`,
          [event_id, zone.toUpperCase(), slot_num, vehicle, vehicle]);
        console.log(c('green', `\n  ✓ Parking allocated: Zone-${zone} Slot-${slot_num}`));

      } else if (sub === 'food') {
        hdr('PLACE FOOD ORDER');
        const event_id  = await ask('Event ID:');
        const booking_id= await ask('Booking ID (or blank):');
        const item_name = await ask('Item name:');
        const quantity  = await ask('Quantity [1]:') || '1';
        const price     = await ask('Price per item:');
        const stall     = await ask('Stall [Stall-1]:') || 'Stall-1';
        const [r] = await conn.execute(
          'INSERT INTO food_orders (event_id,booking_id,item_name,quantity,price,stall) VALUES (?,?,?,?,?,?)',
          [event_id, booking_id||null, item_name, quantity, price, stall]);
        console.log(c('green', `\n  ✓ Order placed! ID=${r.insertId}`));
      }

    // ── DELETE ──────────────────────────────────────────────
    } else if (cmd === 'delete') {
      if (!sub || !id) return console.log(c('red','  Usage: node cli.js delete <event|booking|parking|food> <id>'));
      const tableMap = { event:'events', booking:'bookings', parking:'parking', food:'food_orders' };
      const idMap    = { event:'event_id', booking:'booking_id', parking:'slot_id', food:'order_id' };
      const tbl = tableMap[sub], col = idMap[sub];
      if (!tbl) return console.log(c('red','  Unknown entity: ' + sub));
      const confirm = await ask(`${c('red','Delete')} ${sub} #${id}? (yes/no):`);
      if (confirm.toLowerCase() === 'yes') {
        await conn.execute(`DELETE FROM ${tbl} WHERE ${col}=?`, [id]);
        console.log(c('green', `\n  ✓ Deleted ${sub} #${id}`));
      } else {
        console.log(c('yellow','  Cancelled.'));
      }

    // ── UPDATE ──────────────────────────────────────────────
    } else if (cmd === 'update') {
      if (!sub || !id) return console.log(c('red','  Usage: node cli.js update <booking|food|parking> <id> <status>'));
      const status = process.argv[5] || await ask('New status:');
      if (sub === 'booking') {
        await conn.execute('UPDATE bookings SET status=? WHERE booking_id=?', [status, id]);
      } else if (sub === 'food') {
        await conn.execute('UPDATE food_orders SET status=? WHERE order_id=?', [status, id]);
      } else if (sub === 'parking') {
        if (status === 'free') {
          await conn.execute("UPDATE parking SET status='available',vehicle_no=NULL,allocated_at=NULL WHERE slot_id=?", [id]);
        }
      }
      console.log(c('green', `\n  ✓ Updated ${sub} #${id} → ${status}`));

    // ── STATS ───────────────────────────────────────────────
    } else if (cmd === 'stats') {
      hdr('DASHBOARD STATS');
      const [[ev]]  = await conn.execute('SELECT COUNT(*) AS c FROM events WHERE status="scheduled"');
      const [[bk]]  = await conn.execute('SELECT COUNT(*) AS c FROM bookings WHERE status="confirmed"');
      const [[rev]] = await conn.execute('SELECT COALESCE(SUM(price_paid),0) AS t FROM bookings WHERE status!="cancelled"');
      const [[ins]] = await conn.execute(`SELECT COALESCE(SUM(CASE WHEN direction='entry' THEN count ELSE -count END),0) AS c FROM crowd_flow`);
      const [[pk]]  = await conn.execute("SELECT COUNT(*) AS c FROM parking WHERE status='occupied'");
      const [[fo]]  = await conn.execute("SELECT COUNT(*) AS c FROM food_orders WHERE status IN ('pending','preparing')");
      console.log(`\n  ${c('cyan','📅 Scheduled Events')}   ${c('bold',ev.c)}`);
      console.log(`  ${c('cyan','🎟️  Confirmed Bookings')} ${c('bold',bk.c)}`);
      console.log(`  ${c('cyan','💰 Total Revenue')}      ${c('green','₹'+Number(rev.t).toLocaleString())}`);
      console.log(`  ${c('cyan','👥 People Inside')}      ${c('bold',ins.c)}`);
      console.log(`  ${c('cyan','🚗 Occupied Parking')}   ${c('bold',pk.c)}`);
      console.log(`  ${c('cyan','🍕 Pending Food Orders')}${c('yellow',fo.c)}`);
      console.log('');
      const [revRows] = await conn.execute('SELECT * FROM v_revenue');
      console.log(c('bold','  Revenue by Event:'));
      revRows.forEach(r =>
        console.log(`    ${r.event_name.substring(0,30).padEnd(32)} Tickets: ${c('green','₹'+r.ticket_revenue)}  Food: ${c('green','₹'+r.food_revenue)}`));

    // ── QR LOOKUP ───────────────────────────────────────────
    } else if (cmd === 'qr') {
      if (!sub) return console.log(c('red','  Usage: node cli.js qr <qr_code>'));
      hdr('QR CODE LOOKUP');
      const [[r]] = await conn.execute(
        `SELECT b.*,s.section,s.row_num,s.seat_num,e.name AS event_name
         FROM bookings b JOIN seats s ON s.seat_id=b.seat_id
         JOIN events e ON e.event_id=b.event_id WHERE b.qr_code=?`, [sub]);
      if (!r) return console.log(c('red','  ✗ QR Code not found'));
      row(r);

    } else {
      showHelp();
    }
  } catch (err) {
    console.error(c('red','\n  ✗ Error: ') + err.message);
    if (err.code === 'ECONNREFUSED') {
      console.log(c('yellow','  → Is MySQL running? Check DB_PASS env var.'));
    }
  } finally {
    rl.close();
    await conn.end();
  }
}

function showHelp() {
  console.log(`
  ${c('bold','COMMANDS')}
  ${c('cyan','list')}   events                    List all events
  ${c('cyan','list')}   bookings [event_id]        List bookings
  ${c('cyan','list')}   seats    <event_id>        Show seat map
  ${c('cyan','list')}   crowd                      Crowd summary
  ${c('cyan','list')}   parking  [event_id]        Parking status
  ${c('cyan','list')}   food     [event_id]        Food orders

  ${c('cyan','add')}    event                      Interactive add event
  ${c('cyan','add')}    booking                    Interactive booking
  ${c('cyan','add')}    crowd                      Log crowd data
  ${c('cyan','add')}    parking                    Allocate parking
  ${c('cyan','add')}    food                       Place food order

  ${c('cyan','delete')} event    <id>              Delete event
  ${c('cyan','delete')} booking  <id>              Cancel booking
  ${c('cyan','delete')} parking  <id>              Remove parking record
  ${c('cyan','delete')} food     <id>              Delete food order

  ${c('cyan','update')} booking  <id> <status>     confirmed|cancelled|used
  ${c('cyan','update')} food     <id> <status>     pending|preparing|ready|delivered
  ${c('cyan','update')} parking  <id> free         Free up a slot

  ${c('cyan','stats')}                             Dashboard overview
  ${c('cyan','qr')}     <qr_code>                  Lookup booking by QR

  ${c('dim','Set DB_PASS env var: set DB_PASS=yourpassword (Windows)')}
  ${c('dim','                     export DB_PASS=yourpassword (Mac/Linux)')}
`);
}

main();