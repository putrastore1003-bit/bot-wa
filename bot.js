const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs')
const http = require('http')
const QRCode = require('qrcode')

// GANTI 2 INI AJA BOS
const SHEET_POST = 'https://script.google.com/macros/s/XXXXX/exec' // link /exec
const SHEET_VIEW = 'https://docs.google.com/spreadsheets/d/XXXXX/edit' // link sheet

const ADMIN = '6285642901005'

let orders = []
if(fs.existsSync('orders.json')) try{orders=JSON.parse(fs.readFileSync('orders.json'))}catch{}
function save(){ fs.writeFileSync('orders.json', JSON.stringify(orders,null,2)) }

let qrLast = '', isConnect = false

// web qr
const server = http.createServer(async (req,res)=>{
  if(req.url==='/qr'){
    if(isConnect) return res.end('✅ BOT AWAL AKTIF')
    if(!qrLast) return res.end('Tunggu QR...<script>setTimeout(()=>location.reload(),3000)</script>')
    const img = await QRCode.toDataURL(qrLast)
    res.end(`<center><img src="${img}" width="350"/><p>SCAN BOS</p></center><script>setTimeout(()=>location.reload(),20000)</script>`)
  }else res.end('BOT AWAL NYALA - /qr')
})
server.listen(process.env.PORT||3000)

// bot
async function start(){
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const sock = makeWASocket({version, auth: state, logger: P({level:'silent'}), browser:['Bot Awal','Chrome','1.0']})
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', u=>{
    if(u.qr) qrLast=u.qr
    if(u.connection==='open'){ isConnect=true; console.log('✅ AKTIF') }
    if(u.connection==='close' && u.lastDisconnect?.error?.output?.statusCode!==DisconnectReason.loggedOut) setTimeout(start,3000)
  })

  sock.ev.on('messages.upsert', async ({messages})=>{
    const m = messages[0]; if(!m.message || m.key.fromMe) return
    const from = m.key.remoteJid
    const text = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim()
    const name = m.pushName || 'Bos'
    const isAdmin = from.includes(ADMIN) || (m.key.remoteJidAlt||'').includes(ADMIN)

    // CUSTOMER KIRIM IMEI 15 DIGIT -> OTOMATIS SEMUA
    if(/^\d{15}$/.test(text) && !isAdmin){
      const id = Date.now().toString().slice(-6)
      const tanggal = new Date().toLocaleString('id-ID')
      orders.push({id, imei:text, nama:name, wa:from, status:'ANTRI', tanggal})
      save()

      // OTOMATIS MASUK SHEET REALTIME
      fetch(SHEET_POST, {method:'POST', body:JSON.stringify({id, tanggal, nama:name, imei:text, status:'ANTRI', wa:from})}).catch(()=>{})

      // OTOMATIS BALES CUSTOMER
      await sock.sendMessage(from, {text:`✅ Diterima #${id}\nIMEI: ${text}\nANTRI`})
      
      // OTOMATIS KIRIM KE ADMIN
      await sock.sendMessage(ADMIN+'@s.whatsapp.net', {text:`🔥 BARU #${id}\n${name}\n${text}\n\n/proses ${id}\n/done ${id}`}).catch(async()=>{
        await sock.sendMessage(from.includes(ADMIN)?from:ADMIN+'@lid', {text:`🔥 BARU #${id}\n${name}\n${text}`})
      })
    }

    // ADMIN CUMA 3 PERINTAH - OTOMATIS SEMUA
    if(isAdmin){
      const [cmd, id] = text.split(' ')
      const o = orders.find(x=>x.id===id)

      if(cmd==='/proses' && o){
        o.status='PROSES'; save()
        fetch(SHEET_POST, {method:'POST', body:JSON.stringify({id:o.id, tanggal:o.tanggal, nama:o.nama, imei:o.imei, status:'PROSES', wa:o.wa})}).catch(()=>{})
        await sock.sendMessage(o.wa, {text:`🔄 #${id} DIPROSES`})
        await sock.sendMessage(from, {text:`✅ #${id} PROSES`})
      }
      if(cmd==='/done' && o){
        o.status='DONE'; save()
        fetch(SHEET_POST, {method:'POST', body:JSON.stringify({id:o.id, tanggal:o.tanggal, nama:o.nama, imei:o.imei, status:'DONE', wa:o.wa})}).catch(()=>{})
        await sock.sendMessage(o.wa, {text:`✅ DONE #${id} IMEI aktif!`})
        await sock.sendMessage(from, {text:`✅ #${id} DONE`})
      }
      if(cmd==='/rekap'){
        const antri = orders.filter(x=>x.status==='ANTRI').length
        const done = orders.filter(x=>x.status==='DONE').length
        await sock.sendMessage(from, {text:`📊 REKAP\nANTRI: ${antri}\nDONE: ${done}\nTOTAL: ${orders.length}\n\nSHEET:\n${SHEET_VIEW}`})
      }
    }
  })
}
start()
