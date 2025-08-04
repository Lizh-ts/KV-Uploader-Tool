function base64UrlEncode(str) {
  return btoa(str)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlEncodeUint8(arr) {
  const str = String.fromCharCode(...new Uint8Array(arr));
  return base64UrlEncode(str);
}
function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

async function signJWT(payload, secret) {
  const enc = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };
  const headerBase64 = base64UrlEncode(JSON.stringify(header));
  const payloadBase64 = base64UrlEncode(JSON.stringify(payload));
  const data = new TextEncoder().encode(`${headerBase64}.${payloadBase64}`);
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, data);
  const signatureBase64 = base64UrlEncodeUint8(signature);
  return `${headerBase64}.${payloadBase64}.${signatureBase64}`;
}

async function verifyJWT(token, secret) {
  const enc = new TextEncoder();
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const signature = Uint8Array.from(atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify("HMAC", key, signature, data);
  if (!valid) return null;
  const payloadStr = base64UrlDecode(payloadB64);
  const payload = JSON.parse(payloadStr);
  if (payload.exp && Date.now() >= payload.exp * 1000) return null;
  return payload;
}

const attempts = new Map();
function isBlocked(ip) {
  const record = attempts.get(ip);
  if (!record) return false;
  const { count, lastTime } = record;
  if (count >= 5 && Date.now() - lastTime < 10_000) {
    return true;
  }
  return false;
}
function recordAttempt(ip, success = false) {
  if (success) {
    attempts.delete(ip);
  } else {
    const record = attempts.get(ip) || { count: 0, lastTime: 0 };
    record.count++;
    record.lastTime = Date.now();
    attempts.set(ip, record);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ip = request.headers.get("cf-connecting-ip") || "unknown"
    const country = request.headers.get("CF-IPCountry");
    
    try {
    } catch (e) {
      console.error("Something was Broken", e.message)
    }

    // 首頁，顯示登入和上傳表單
    if (url.pathname === "/") {
      if (country !== "TW") {
        return new Response("你辱華了", { status: 403 });
      }
      const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KV上傳工具</title>
  <style>
    body {
      font-family: "Noto Sans TC", sans-serif;
      background: #f4f4f4;
    }
    h2 {
      color: #333;
      text-align:center;
    }
    .form-wrapper,
    .form-wrapper2 {
      max-width: 320px;
      margin: 0 auto;
      padding: 20px;
      background: white;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }
    #uploadForm {
      background: white;
      border-radius: 8px;
      width: 320px;
    }
    #result,
    label,
    select,
    input,
    button {
      display: block;
      width: 100%;
      box-sizing: border-box;
    }
    #result,
    select,
    input,
    button {
      margin-top: 20px;
      margin-bottom: 0px;
      padding: 8px;
      font-size: 14px;
      border-radius: 5px;
      border: 1px solid #ccc;
    }
    button {
      background-color: #007bff;
      color: white;
      border: none;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    button:hover {
      background-color: #0056b3;
    }
    #countdown {
      text-align:center;
      color: red;
      font-weight: bold;
    }
    #result {
      height: 160px;
      overflow-y: auto;
      background-color: #1e1e1e;
      color: #00ff00;
      //font-size: 12px;
      font-family: Consolas, "PMingLiU", monospace;
      white-space: pre-wrap;
      scroll-behavior: smooth;
    }
  </style>
</head>
<body>
  <h1>KV上傳工具</h1>
  <h2 id="func">登入</h2>
  <div class="form-wrapper">
    <form id="loginForm">
      <input type="password" id="pw" placeholder="房主的邀請" required style="margin-top: 0px;">
      <button type="submit" style="margin-top: 20px;">我要進去了</button>
    </form>
  </div>

  <section id="uploadSection" style="display:none;">
    <div class="form-wrapper2">
      <div id="countdown" style="font-weight:bold; margin-bottom:10px;"></div>
      <form id="uploadForm">
        <label for="kv-select">檔案要丟到</label>
        <select id="kv-select" name="kvNamespace" style="margin-top: 0px;">
          <option value="image">image</option>
          <option value="rckl">rckl</option>
        </select>
        <input type="file" name="file" required>
        <input type="text" name="name" placeholder="取個能聽的綽號">
        <button>塞進去</button>
        <button id="logoutBtn">登出</button>
        <pre id="result"></pre>
      </form>
    </div>
  </section>

  <script>
    let token = "";
    let countdown = 444; //444sec
    let timerInterval;
    function startCountdown() {
      clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        countdown--;
        document.getElementById('countdown').textContent = \`壽命：\${countdown}秒\`;
        
        if (countdown <= 0) {
          clearInterval(timerInterval);
          alert('壽終正寢，被系統踢出去了');
          token = "";
          document.getElementById("func").innerText = "登入";
          document.getElementById('uploadSection').style.display = 'none';
          document.querySelector('.form-wrapper').style.display = 'block';
        }
      }, 1000);
    }
    document.getElementById("logoutBtn").addEventListener("click", () => {
      alert('為何要自殺');
      countdown = 0;
      clearInterval(timerInterval);
      token = "";
      document.getElementById("func").innerText = "登入";
      document.getElementById('uploadSection').style.display = 'none';
      document.querySelector('.form-wrapper').style.display = 'block';
      document.getElementById('countdown').textContent = '';
    });
    document.getElementById('loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const pw = document.getElementById('pw').value;
      const res = await fetch('/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      });
      if (res.ok) {
        countdown = 444;
        startCountdown();
        const data = await res.json();
        token = data.token;
        document.getElementById("func").innerText = "圖片上傳";
        document.querySelector('.form-wrapper').style.display = 'none';
        document.getElementById('uploadSection').style.display = 'block';
      } else {
        const data = await res.json();
        alert(data.error || '你很失敗');
      }
    });
    
    document.getElementById('uploadForm').addEventListener('submit', async e => {
      e.preventDefault();
      const kvNamespace = document.getElementById("kv-select").value;
      const formData = new FormData(document.getElementById('uploadForm'));
      const res = await fetch('/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: formData
      });
      const text = await res.text();
      const timestamp = new Date().toLocaleString();
      const result = document.getElementById('result');
      result.textContent += \`\${timestamp} - \${text}\n\`;
      result.scrollTop = result.scrollHeight;
    });
  </script>
</body>
</html>`;
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    // 登入 /auth API：驗證密碼並簽發 JWT
    if (url.pathname === "/auth" && request.method === "POST") {
      if (isBlocked(ip)) {
        return new Response(JSON.stringify({ error: "你死了" }), { status: 429, headers: { "content-type": "application/json" } });
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: "你拿個跟你一樣破的文件就想登入，沒門" }), { status: 400, headers: { "content-type": "application/json" } });
      }
      if (body.password !== env.密碼) {
        recordAttempt(ip, false);
        return new Response(JSON.stringify({ error: "你是白癡嗎，很好玩是不是" }), { status: 403, headers: { "content-type": "application/json" } });
      }
      recordAttempt(ip, true);
      await fetch(env.DC通知器, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `某人 ${ip} 於 ${new Date().toISOString()} 成功登入 KV 上傳工具`,
        }),
      });
      const payload = { user: "admin", exp: Math.floor(Date.now() / 1000) + 444 }; // 444sec過期
      const token = await signJWT(payload, env.秘密);
      return new Response(JSON.stringify({ token }), { headers: { "content-type": "application/json" } });
    }

    // 上傳 API：需要 JWT 驗證
    if (url.pathname === "/upload" && request.method === "POST") {
      if (country !== "TW") {
        return new Response("你辱華了", { status: 403 });
      }
      const auth = request.headers.get("Authorization") || "";
      const token = auth.replace("Bearer ", "").trim();
      const payload = await verifyJWT(token, env.秘密);
      if (!payload) return new Response("沒授權在上傳三小", { status: 403 });
      const formData = await request.formData();
      const file = formData.get("file");
      const name = formData.get("name") || file?.name;
      const kvNamespace = formData.get("kvNamespace");
      if (!(file instanceof File)) return new Response("你按心酸的，完全沒有任何檔案", { status: 400 });
      if (!name) return new Response("你的檔案軼名是嗎", { status: 400 });
      if (!["image", "rckl"].includes(kvNamespace)) return new Response("儲存位置在選單之外，你是怎麼選的", { status: 400 });
      const bytes = await file.arrayBuffer();
      const kvMap = {
        image: env.你的資料庫名稱,
        rckl: env.你的資料庫名稱,
      };
      const allowedExts = ["jpg", "jpeg", "png", "webp", "mp3", "wav", "mp4", "html", "txt", "pdf"];
      const nameLower = name.toLowerCase();
      const ext = nameLower.substring(nameLower.lastIndexOf('.') + 1);
      if (!allowedExts.includes(ext)) {
        return new Response("我不認這個鬼東西", { status: 400 });
      }
      const targetKV = kvMap[kvNamespace];
      if (!targetKV) return new Response("你選的KV勒", { status: 500 });
      await targetKV.put(name, bytes);
      return new Response(`已上傳至 ${kvNamespace} 名為 ${name}`, { headers: { "Access-Control-Allow-Origin": "*" } });
    }

    // 取得圖片
    if (url.pathname.startsWith("/file/")) {
      const key = decodeURIComponent(url.pathname.replace("/file/", ""));
      const data = await env.你的資料庫名稱.get(key, { type: "arrayBuffer" });
      if (!data) return new Response("你眼睛業障重，看不到這個東西", { status: 404 });
      const ext = key.split(".").pop().toLowerCase();
      const contentTypes = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        mp3: "audio/mpeg",
        wav: "audio/wav",
        mp4: "video/mp4",
        html: "text/html; charset=utf-8",
        txt: "text/plain; charset=utf-8",
        pdf: "application/pdf"
      };
      return new Response(data, { headers: { "Content-Type": contentTypes[ext] || "application/octet-stream", "Access-Control-Allow-Origin": "*" } });
    }
    return new Response("在輸入什麼狗屁東西，沒有這個路徑\n You mom is died", { status: 200 });
  },
};