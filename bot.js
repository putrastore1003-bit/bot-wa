const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const Pino = require('pino')
const fs = require('fs')
const ExcelJS = require('exceljs')
const QRCode = require('qrcode')
const express = require('express')

const ADMIN_NUMBER = '6285642901005@s.whatsapp.net'
const ADMIN_LID = '74882771615980@lid'

// DATABASE
let orders = []
if(fs.existsSync('orders.json')) try{orders = JSON.parse(fs.readFileSync('orders.json'))}catch{}
function saveDB(){
  fs.writeFileSync('orders.json', JSON.stringify(orders,null,2))
  updateLiveExcel()
}
const pending = {}
const last4 = (imei) => imei.slice(-4)
const statusHuruf = (s) => { if(s==='ANTRI') return 'A'; if(s==='PROSES') return 'P'; if(s==='DONE') return 'D'; if(s==='GAGAL') return 'G'; return s }

const PAKET = {
  '1': { nama: '3 Bulan Fast', deskripsi: 'Proses 10menit - 3jam, Sinyal Aktif 3 Bulan ~ Bergaransi' },
  '2': { nama: '3 Bulan Slow', deskripsi: 'Proses 1x24Jam ( Send sebelum jam 14.00 WIB Sinyal aktif malem itu juga jam 22.00 WIB) Sinyal aktif 3 Bulan ~ Bergaransi' },
  '3': { nama: '1 Bulan Fast', deskripsi: 'Proses 10menit - 1Jam\nSinyal Aktif 1 Bulan ~ Bergaransi' }
}

// --- WEB SERVER BUAT SCAN QR ---
let lastQR = null
let isConnected = false
const app = express()
const PORT = process.env.PORT || 3000

app.get('/', async (req,res)=>{
  if(isConnected){
    return res.send(`<h1>✅ BOT AKTIF - ${orders.length} Order</h1><p>File: Rekap_LIVE.xlsx</p>`)
  }
  if(!lastQR){
    return res.send('<h1>⏳ Menunggu QR... Refresh 5 detik</h1><script>setTimeout(()=>location.reload(),5000)</script>')
  }
  res.send(`
    <html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="text-align:center;font-family:sans-serif;padding:20px">
    <h2>SCAN QR BOT IMEI</h2>
    <img src="${lastQR}" style="width:90%;max-width:380px;border:8px solid #000" />
    <p>QR ganti 20 detik, halaman auto-refresh</p>
    <p><b>WA > Perangkat Tertaut > Tautkan Perangkat</b></p>
    <script>setTimeout(()=>location.reload(),20000)</script>
    </body></html>
  `)
})
app.listen(PORT, ()=> console.log('Web QR jalan di port '+PORT))

// REAL TIME EXCEL
async function updateLiveExcel(){
  try{
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Rekap LIVE')
    sheet.columns = [
      { header: 'ID', key: 'id', width: 12 },
      { header: 'IMEI Full', key: 'imei', width: 20 },
      { header: '4 Belakang', key: 'last4', width: 12 },
      { header: 'Paket', key: 'paket', width: 18 },
      { header: 'Status Huruf', key: 'huruf', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Customer', key: 'customerName', width: 20 },
      { header: 'Tanggal', key: 'tanggal', width: 22 },
      { header: 'Alasan', key: 'alasan', width: 25 }
    ]
    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF00FF00'} }
    orders.forEach(o=> sheet.addRow({ id:o.id, imei:o.imei, last4:last4(o.imei), paket:o.paket, huruf:statusHuruf(o.status), status:o.status, customerName:o.customerName, tanggal:o.tanggal, alasan:o.alasan||'' }))
    await workbook.xlsx.writeFile('Rekap_LIVE.xlsx')
    console.log(`📊 LIVE updated: ${orders.length} order`)
  }catch(e){ console.log('Gagal update LIVE', e.message) }
}
async function buatRekapExcel(){
  if(!fs.existsSync('Rekap_LIVE.xlsx')) await updateLiveExcel()
  const file = `Rekap_${new Date().toISOString().slice(0,10)}_${Date.now().toString().slice(-4)}.xlsx`
  fs.copyFileSync('Rekap_LIVE.xlsx', file)
  return file
}

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const sock = makeWASocket({ auth: state, logger: Pino({level:'silent'}), browser: ['Bot IMEI','Chrome','1.0'] })
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (u)=>{
    if(u.qr){
      lastQR = await QRCode.toDataURL(u.qr) // JADI GAMBAR BISA DI SCAN
      isConnected = false
      console.log('QR BARU SIAP - Buka https://bot-wa-production-1d7c.up.railway.app untuk scan')
    }
    if(u.connection==='open'){
      isConnected = true
      lastQR = null
      console.log(`✅ BOT REAL TIME AKTIF 24 JAM`)
      updateLiveExcel()
    }
    if(u.connection==='close'){
      isConnected = false
      console.log('Koneksi putus, reconnect...')
      setTimeout(startBot, 3000)
    }
  })

  sock.ev.on('messages.upsert', async ({messages})=>{
    const msg = messages[0]; if(!msg.message || msg.key.fromMe) return
    const from = msg.key.remoteJid
    const fromAlt = msg.key.remoteJidAlt || ''
    let text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim()
    const name = msg.pushName || 'Bos'
    const isAdmin = from === ADMIN_NUMBER || from === ADMIN_LID || fromAlt === ADMIN_NUMBER || fromAlt === ADMIN_LID
    const lower = text.toLowerCase()

    if(!isAdmin){
      if(lower.startsWith('cek status') || lower.startsWith('cekstatus') || lower.startsWith('cek ') || lower.startsWith('status ')){
        const imeiMatch = text.match(/\d{15}/)
        if(!imeiMatch){ await sock.sendMessage(from, { text: `❌ Format: Cek status 15angka` }); return }
        const imei = imeiMatch[0]
        const o = orders.filter(x=>x.imei===imei).slice(-1)[0]
        if(!o){ await sock.sendMessage(from, { text: `❌ IMEI...${last4(imei)} tidak ketemu` }); return }
        await sock.sendMessage(from, { text: `📋 STATUS\nID #${o.id}...${last4(o.imei)}\nPaket: ${o.paket}\nStatus: ${o.status} (${statusHuruf(o.status)})` })
        return
      }
      if(pending[from] && ['1','2','3'].includes(text)){
        const imei = pending[from]
        const paket = PAKET[text]
        const id = Date.now().toString().slice(-6);
        orders.push({ id, imei, paket: paket.nama, paketDetail: paket.deskripsi, customerJid: from, customerName: name, status: 'ANTRI', tanggal: new Date().toLocaleString('id-ID') });
        saveDB()
        delete pending[from]
        await sock.sendMessage(from, { text: `✅ Order #${id}...${last4(imei)} ${paket.nama} ANTRI\nCek: Cek status ${imei}` })
        const pesanAdmin = `🔥 BARU #${id} |...${last4(imei)}\n👤 ${name}\n📱 ${imei}\n📦 ${paket.nama}\nP ${last4(imei)} | D ${last4(imei)}`
        try{ await sock.sendMessage(ADMIN_LID, { text: pesanAdmin }) }catch{ await sock.sendMessage(ADMIN_NUMBER, { text: pesanAdmin }) }
        return
      }
      if(/^\d{15}$/.test(text)){ pending[from] = text; await sock.sendMessage(from, { text: `📱 IMEI OK: ${text}\n\n1️⃣ ${PAKET['1'].nama}\n${PAKET['1'].deskripsi}\n\n2️⃣ ${PAKET['2'].nama}\n${PAKET['2'].deskripsi}\n\n3️⃣ ${PAKET['3'].nama}\n${PAKET['3'].deskripsi}\n\nBalas 1/2/3` }); return }
      if(/^\d+$/.test(text) && text.length!==15){ await sock.sendMessage(from, { text: `❌ IMEI SALAH! Harus 15 angka` }); return }
      if(!pending[from]){ await sock.sendMessage(from, { text: `Halo bos ${name} 👋\n📌 ORDER: Kirim IMEI 15 angka\n📌 CEK STATUS: Cek status 123456789012345` }) }
    }

    if(isAdmin){
      if(lower === 'rekap' || lower.includes('send rekap') || lower === 'rekap orderan'){
        await sock.sendMessage(from, { text: `⏳ Ambil data LIVE ${orders.length} order...` })
        try{
          const file = await buatRekapExcel()
          await sock.sendMessage(from, {
            document: { url: `./${file}` },
            mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            fileName: file,
            caption: `📊 REKAP REAL TIME\nTotal: ${orders.length}\nUpdate: ${new Date().toLocaleString('id-ID')}`
          })
        }catch(e){ await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }) }
        return
      }
      const parts = text.split(' ')
      const huruf = parts[0].toUpperCase()
      const inputId = parts[1]
      const alasan = parts.slice(2).join(' ') || 'Hubungi admin'
      let o = null
      if(['P','D','G','R'].includes(huruf)) o = orders.find(x=>x.id===inputId) || orders.filter(x=>x.imei.endsWith(inputId)).slice(-1)[0] || orders.filter(x=>x.imei===inputId).slice(-1)[0]
      if((['P','D','G','R'].includes(huruf)) &&!o && inputId){ await sock.sendMessage(from,{text:`❌ Tidak ketemu ${inputId}`}); return }
      if(huruf === 'P' && o){ o.status='PROSES'; saveDB(); await sock.sendMessage(o.customerJid,{text:`🔄 PROSES #${o.id}...${last4(o.imei)} ${o.paket}`}); await sock.sendMessage(from,{text:`✅ P ~ #${o.id}...${last4(o.imei)} LIVE update`}) }
      if(huruf === 'D' && o){ o.status='DONE'; saveDB(); await sock.sendMessage(o.customerJid,{text:`✅ DONE #${o.id}...${last4(o.imei)} ${o.paket}`}); await sock.sendMessage(from,{text:`✅ D ~ #${o.id}...${last4(o.imei)} LIVE update`}) }
      if(huruf === 'G' && o){ o.status='GAGAL'; o.alasan=alasan; saveDB(); await sock.sendMessage(o.customerJid,{text:`❌ GAGAL #${o.id}...${last4(o.imei)} ${alasan}`}); await sock.sendMessage(from,{text:`✅ G ~ #${o.id}...${last4(o.imei)} LIVE update`}) }
      if(huruf === 'R' && o){ await sock.sendMessage(o.customerJid,{text:`🔁 ${o.status} #${o.id}`}); await sock.sendMessage(from,{text:`🔁 R ~ #${o.id}`}) }
      if(lower === 'list'){ let t=`📋 LIST REAL TIME\n`; orders.slice(-15).reverse().forEach(x=> { t+=`#${x.id}...${last4(x.imei)} ${x.paket} ${statusHuruf(x.status)}\n` }); t+=`\nKetik REKAP`; await sock.sendMessage(from,{text:t}) }
    }
  })
}
startBot()
