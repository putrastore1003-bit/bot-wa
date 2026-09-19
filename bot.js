const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs')
const http = require('http')
const QRCode = require('qrcode')

// ===== SETTING ADMIN =====
const ADMIN_NUMBER = '6285642901005@s.whatsapp.net' // nomor admin utama
const ADMIN_LID = '74882771615980@lid' // LID admin (biar tetap masuk walau @lid)

// ===== DATABASE SIMPLE JSON =====
let orders = []
if(fs.existsSync('orders.json')){
  try{ orders = JSON.parse(fs.readFileSync('orders.json')) }catch{}
}
function saveDB(){
  fs.writeFileSync('orders.json', JSON.stringify(orders, null, 2))
  console.log('DB disimpan, total:', orders.length)
}

// ===== WEB SERVER UNTUK QR =====
let lastQR = ''
let isConnected = false

const server = http.createServer(async (req,res)=>{
  // buka /qr untuk scan
  if(req.url === '/qr'){
    if(isConnected){
      res.writeHead(200,{'Content-Type':'text/html'})
      return res.end('<h1>✅ BOT IMEI SUDAH AKTIF!</h1><p>Bot sudah tertaut, aman tutup halaman ini.</p>')
    }
    if(!lastQR){
      res.writeHead(200,{'Content-Type':'text/html'})
      return res.end('<h2>⏳ Tunggu QR lagi dibuat...</h2><p>Refresh otomatis 3 detik</p><script>setTimeout(()=>location.reload(),3000)</script>')
    }
    // QR jadi gambar
    const qrImg = await QRCode.toDataURL(lastQR)
    res.writeHead(200,{'Content-Type':'text/html'})
    res.end(`
      <center>
        <h2>SCAN QR BOT IMEI FINAL</h2>
        <img src="${qrImg}" width="350" style="border:15px solid white; box-shadow:0 0 10px black"/>
        <p>QR akan ganti tiap 20 detik - Scan pakai WA Bot</p>
        <p>Total Order Masuk: ${orders.length}</p>
      </center>
      <script>setTimeout(()=>location.reload(),20000)</script>
    `)
  } else {
    // halaman utama
    res.writeHead(200,{'Content-Type':'text/html'})
    res.end(`BOT FINAL NYALA - Order: ${orders.length} - <a href="/qr">Buka /qr untuk QR</a>`)
  }
})
server.listen(process.env.PORT || 3000, ()=>console.log('WEB NYALA DI PORT', process.env.PORT||3000))

// ===== FUNGSI BOT UTAMA =====
async function startBot(){
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState('auth')

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({level:'silent'}),
    printQRInTerminal: false,
    browser: ['Bot IMEI Final','Chrome','1.0.0']
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (u)=>{
    const { qr, connection, lastDisconnect } = u
    if(qr){
      lastQR = qr
      console.log('QR BARU MUNCUL - buka /qr')
    }
    if(connection === 'open'){
      isConnected = true
      lastQR = ''
      console.log('✅ BOT IMEI FINAL AKTIF!')
    }
    if(connection === 'close'){
      isConnected = false
      const code = lastDisconnect?.error?.output?.statusCode
      console.log('Koneksi putus code:', code)
      if(code!== DisconnectReason.loggedOut){
        setTimeout(startBot, 3000) // reconnect otomatis
      }
    }
  })

  // ===== LOGIKA PESAN MASUK =====
  sock.ev.on('messages.upsert', async ({messages})=>{
    const msg = messages[0]
    if(!msg.message || msg.key.fromMe) return

    const from = msg.key.remoteJid
    const fromAlt = msg.key.remoteJidAlt || ''
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim()
    const name = msg.pushName || 'Customer'

    // cek apakah pengirim adalah admin
    const isAdmin = from === ADMIN_NUMBER || from === ADMIN_LID || fromAlt === ADMIN_NUMBER || fromAlt === ADMIN_LID

    // --- 1. JIKA CUSTOMER KIRIM IMEI 15 DIGIT ---
    if(/^\d{15}$/.test(text) &&!isAdmin){
      const id = Date.now().toString().slice(-6) // ID 6 digit
      const newOrder = {
        id,
        imei: text,
        customerJid: from,
        customerName: name,
        status: 'ANTRI',
        tanggal: new Date().toLocaleString('id-ID')
      }
      orders.push(newOrder)
      saveDB()

      // balas ke customer
      await sock.sendMessage(from, { text: `✅ Order Diterima\n\nID: #${id}\nIMEI: ${text}\nStatus: ⏳ ANTRI\n\nSimpan ID ini untuk cek status ya bos.` })

      // lapor ke admin
      const pesanAdmin = `🔥 ORDER BARU #${id}\n\n👤 Nama: ${name}\n📱 IMEI: ${text}\n🕒 ${newOrder.tanggal}\n\n--- PERINTAH ADMIN ---\n/proses ${id} = proses\n/done ${id} = selesai\n/gagal ${id} alasan = gagal\n/repeat ${id} = kirim ulang status ke customer`
      try{
        await sock.sendMessage(ADMIN_LID, { text: pesanAdmin })
      }catch{
        await sock.sendMessage(ADMIN_NUMBER, { text: pesanAdmin })
      }
    }

    // --- 2. JIKA ADMIN KIRIM PERINTAH ---
    if(isAdmin){
      const args = text.split(' ')
      const cmd = args[0].toLowerCase()
      const id = args[1]
      const alasan = args.slice(2).join(' ') || 'Hubungi admin untuk info'
      const o = orders.find(x=>x.id===id)

      // /proses 123456
      if(cmd === '/proses' && o){
        o.status = 'PROSES'
        saveDB()
        await sock.sendMessage(o.customerJid, { text: `🔄 Order #${id}\nIMEI: ${o.imei}\nStatus: SEDANG DIPROSES ✅\n\nMohon ditunggu ya bos.` })
        await sock.sendMessage(from, { text: `✅ #${id} status jadi PROSES` })
      }

      // /done 123456
      if(cmd === '/done' && o){
        o.status = 'DONE'
        saveDB()
        await sock.sendMessage(o.customerJid, { text: `✅ DONE! Order #${id}\nIMEI: ${o.imei}\n\nSinyal sudah aktif! Silahkan cek HP nya bos 🙏\nTerimakasih.` })
        await sock.sendMessage(from, { text: `✅ #${id} DONE terkirim ke customer` })
      }

      // /gagal 123456 imei tidak terdaftar
      if(cmd === '/gagal' && o){
        o.status = 'GAGAL'
        o.alasan = alasan
        saveDB()
        await sock.sendMessage(o.customerJid, { text: `❌ GAGAL Order #${id}\nIMEI: ${o.imei}\nAlasan: ${alasan}` })
        await sock.sendMessage(from, { text: `✅ #${id} GAGAL` })
      }

      // /repeat 123456 - kirim ulang status terakhir
      if(cmd === '/repeat' && o){
        let pesanUlang = ''
        if(o.status === 'ANTRI') pesanUlang = `✅ Order #${id}\nIMEI: ${o.imei}\nStatus: ⏳ ANTRI`
        if(o.status === 'PROSES') pesanUlang = `🔄 Order #${id}\nIMEI: ${o.imei}\nStatus: SEDANG DIPROSES ✅`
        if(o.status === 'DONE') pesanUlang = `✅ DONE! Order #${id}\nIMEI: ${o.imei}\nSinyal sudah aktif!`
        if(o.status === 'GAGAL') pesanUlang = `❌ GAGAL Order #${id}\nIMEI: ${o.imei}\nAlasan: ${o.alasan||''}`
        await sock.sendMessage(o.customerJid, { text: pesanUlang + `\n\n(Pesan diulang oleh admin)` })
        await sock.sendMessage(from, { text: `🔁 #${id} berhasil di-REPEAT ke customer` })
      }

      // /list - lihat 20 order terakhir
      if(cmd === '/list'){
        let t = `📋 LIST 20 ORDER TERAKHIR (${orders.length} total)\n\n`
        orders.slice(-20).reverse().forEach(x=>{ t+=`#${x.id} | ${x.imei} | ${x.status} | ${x.customerName}\n` })
        await sock.sendMessage(from, { text: t })
      }

      // /rekap - rekap otomatis
      if(cmd === '/rekap'){
        const antri = orders.filter(x=>x.status==='ANTRI').length
        const proses = orders.filter(x=>x.status==='PROSES').length
        const done = orders.filter(x=>x.status==='DONE').length
        const gagal = orders.filter(x=>x.status==='GAGAL').length
        const hariIni = orders.filter(x=>x.tanggal.includes(new Date().toLocaleDateString('id-ID').split('/')[0])).length
        await sock.sendMessage(from, { text: `📊 REKAP OTOMATIS\n\n⏳ ANTRI: ${antri}\n🔄 PROSES: ${proses}\n✅ DONE: ${done}\n❌ GAGAL: ${gagal}\n\n📦 TOTAL SEMUA: ${orders.length}\n\nKetik /list untuk detail` })
      }
    }
  })
}

startBot()
