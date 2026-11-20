# 乐乐新闻 tracking Sheet: setup

1. Create a new Google Sheet, e.g. "乐乐新闻 用户记录".
2. Extensions → Apps Script. Delete the sample code and paste all of `Code.gs`. Save.
3. Deploy → New deployment → gear icon → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click Deploy → Authorize access → choose your Google account → Advanced → Go to project (unsafe) → Allow.
5. Copy the **Web app URL** (ends in `/exec`) and put it in `js/config.js` as `trackUrl`.

When you change `Code.gs` later: Deploy → Manage deployments → ✏️ edit → Version: **New version** → Deploy (the URL stays the same).

Tabs (created automatically): 用户总览 (one row per phone), 动作记录 (every action), 收藏 (favourites per name).
