
const http = require("http");
const crypto = require("crypto");

const PORT = Number(process.env.SERVER_PORT || process.env.PORT || 3000);
const HOST = "0.0.0.0";

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const DEVICE_TOKEN = process.env.DEVICE_TOKEN;

if (!ADMIN_TOKEN || !DEVICE_TOKEN) {
  throw new Error("Set ADMIN_TOKEN and DEVICE_TOKEN");
}

let led = false;
let lastSeen = 0;

function authorized(req, token) {
  const received = req.headers["x-api-key"] || "";
  const a = Buffer.from(received);
  const b = Buffer.from(token);
  return a.length === b.length &&
         crypto.timingSafeEqual(a, b);
}

function json(res, code, data) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;

  // ESP32 reads the requested LED state
  if (path === "/api/device" && req.method === "GET") {
    if (!authorized(req, DEVICE_TOKEN))
      return json(res, 401, { error: "Unauthorized" });

    lastSeen = Date.now();
    return json(res, 200, { led });
  }

  // Phone changes LED state
  if (path === "/api/led" && req.method === "POST") {
    if (!authorized(req, ADMIN_TOKEN))
      return json(res, 401, { error: "Unauthorized" });

    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024) req.destroy();
    });

    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (typeof data.led !== "boolean")
          return json(res, 400, { error: "Invalid LED state" });

        led = data.led;
        return json(res, 200, { led });
      } catch {
        return json(res, 400, { error: "Invalid JSON" });
      }
    });
    return;
  }

  if (path === "/api/status" && req.method === "GET") {
    if (!authorized(req, ADMIN_TOKEN))
      return json(res, 401, { error: "Unauthorized" });

    return json(res, 200, {
      led,
      online: Date.now() - lastSeen < 10000
    });
  }

  if (path === "/" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
    });

    return res.end(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESP32 Global Control</title>
<style>
body{background:#101827;color:white;font-family:Arial;text-align:center;padding:45px 12px}
main{max-width:420px;margin:auto;background:#202c40;padding:30px;border-radius:20px}
button{padding:17px 35px;margin:8px;border:0;border-radius:12px;color:white;font-size:20px}
.on{background:#16834a}.off{background:#c33333}
input{padding:13px;width:85%;border-radius:8px;margin:12px}
</style>
</head>
<body>
<main>
<h1>ESP32 Global Control</h1>
<p>التحكم بالإضاءة من أي مكان</p>
<input type="password" id="key" placeholder="رمز التحكم السري">
<p id="status">جاهز</p>
<button class="on" onclick="send(true)">تشغيل</button>
<button class="off" onclick="send(false)">إطفاء</button>
</main>
<script>
async function send(state){
 const key=document.getElementById("key").value;
 const status=document.getElementById("status");
 try{
  const r=await fetch("/api/led",{
   method:"POST",
   headers:{"Content-Type":"application/json","X-API-Key":key},
   body:JSON.stringify({led:state})
  });
  if(!r.ok) throw new Error("تحقق من الرمز أو الاتصال");
  status.textContent=state?"تم طلب التشغيل":"تم طلب الإطفاء";
 }catch(e){status.textContent=e.message;}
}
</script>
</body>
</html>`);
  }

  json(res, 404, { error: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log("Server listening on port " + PORT);
});
