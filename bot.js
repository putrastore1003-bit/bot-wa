const http = require('http');
const server = http.createServer((req,res)=>{
  res.writeHead(200,{'Content-Type':'text/plain'});
  res.end('BOT NYALA - siap pasang QR');
});
server.listen(process.env.PORT || 3000, ()=>console.log('WEB NYALA'));
