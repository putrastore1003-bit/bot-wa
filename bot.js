const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys')
const P = require('pino')
const http = require('http')
const QRCode = require('qrcode')

let lastQR = ''
let sock

const server = http.createServer(async (req,res)=>{
  if(req.url.startsWith('/qr')){
    if(!lastQR){
      res.writeHead(200,{'Content-Type':'text/html'})
      return res.end('<h2>Tunggu QR...</h2><p>Refresh 5 detik lagi</p><script>setTimeout(()=>location.reload(),5000)</script>')
    }
    try{
      const qrImage = await QRCode.toDataURL(lastQR)
      res.writeHead(200,{'Content-Type':'text/html'})
      res.end(`<center><h2>SCAN QR INI BOS</h2><img src="${qrImage}" width="350" style="border:10px solid white"/><br><p>QR ganti tiap 20 detik, auto refresh</p></center><script>setTimeout(()=>location.reload(),20000)</script>`)
    }catch(e){ res.end('error QR: '+e.message) }
  } else {
    res.end('Buka /qr untuk QR Code')
  }
})
server.listen(process.env.PORT||3000, ()=>console.log('WEB SIAP'))

async function start(){
  try{
    const { version } = await fetchLatestBaileysVersion()
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    sock = makeWASocket({version, auth: state, logger: P({level:'silent'}), printQRInTerminal: false, browser:['Bot WA','Chrome','1.0']})
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', u=>{
      const { qr, connection, lastDisconnect } = u
      if(qr){ 
        lastQR = qr
        console.log('QR BARU SIAP - buka /qr')
      }
      if(connection==='open'){ 
        lastQR = ''
        console.log('✅ BOT AKTIF - QR BERHASIL SCAN!') 
      }
      if(connection==='close'){
        const reason = lastDisconnect?.error?.output?.statusCode
        console.log('close reason', reason)
        if(reason !== DisconnectReason.loggedOut) setTimeout(start,3000)
      }
    })
  }catch(e){ console.log('crash start', e.message); setTimeout(start,5000) }
}
start()
