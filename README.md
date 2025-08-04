# Cloudflare Workers KV 上傳/讀取工具

這是一個使用 Cloudflare Workers 搭配 KV 儲存空間的圖片/資料上傳與讀取工具。

## 功能

- 上傳圖片
- 讀取圖片
- 驗證登入
- DC通知

## 環境變數設定

在 Workers → Settings → Variables 中設置下列變數：

| 變數名稱| 說明|
|----|----|
| `env.秘密`| JWT 簽章密鑰，建議為 64 字元隨機亂數 |
| `env.密碼`| 後台登入密碼 |
| `env.DC通知器`| Discord webhook，用於通知上傳事件 |
| `env.你的資料庫名稱`| 綁定的 KV  |

> 注意：本專案程式碼未內含上述變數的值，請自行在 Workers 環境中設定。

## 使用方式

### 登入與上傳

1. 開啟 `/` 頁面（或你定義的上傳介面）
2. 輸入密碼後登入
3. 選擇檔案並上傳，將自動存入 KV

### 讀取圖片

直接使用圖片網址如：

```text
/file/filename.jpg
