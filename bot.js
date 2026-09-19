const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys')
const P = require('pino')
const http = require('http')
const QRCode = require('qrcode')

let lastQR = ''
let isConnected = false

const server = http.createServer(async (req,res)=>{
  if(req.url === '/qr'){
    if(isConnected){
      res.writeHead(200,{'Content-Type':'text/html'})
      return res.end('<h1>✅ BOT UDAH KESAMBUNG!</h1>')
    }
    if(!lastQR){
      res.writeHead(200,{'Content-Type':'text/html'})
      return res.end('<h2>Tunggu QR 5 detik...</h2><script>setTimeout(()=>location.reload(),3000)</script>')
    }
    const qrImg = await QRCode.toDataURL(lastQR)
    res.writeHead(200,{'Content-Type':'text/html'})
    res.end(`<center><h2>SCAN QR INI BOS</h2><img src="${qrImg}" width="350"/><p>Refresh otomatis 20 detik</p></center><script>setTimeout(()=>location.reload(),20000)</script>`)
  } else {
    res.writeHead(200,{'Content-Type':'text/html'})
    res.end('Buka <a href="/qr">/qr</a> untuk QR Code')
  }
})
server.listen(process.env.PORT || 3000, ()=>console.log('WEB NYALA DI PORT '+process.env.PORT))

async function startBot(){
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const sock = makeWASocket({
    version, auth: state,
    logger: P({level:'silent'}),
    printQRInTerminal: false,
    browser: ['Bot WA','Chrome','1.0.0']
  })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async (up)=>{
    const { qr, connection, lastDisconnect } = up
    if(qr){ lastQR = qr; console.log('QR BARU MUNCUL'); }
    if(connection === 'open'){ isConnected = true; lastQR=''; console.log('✅ BOT AKTIF QR!'); }
    if(connection === 'close'){
      isConnected = false
      const code = lastDisconnect?.error?.output?.statusCode
      console.log('Close code', code)
      if(code !== DisconnectReason.loggedOut) setTimeout(startBot, 3000)
    }
  })
}
startBot()
