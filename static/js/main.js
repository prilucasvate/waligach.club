
const socket = io();     //  一開始就連線

//---- login user
// 2.儲存名稱並關閉登入框
function saveUserName() {
const nameInput = document.getElementById("nameInput").value.trim();
if (!nameInput) {
    alert("請輸入名稱！");
    return;
}
// localStorage.setItem("userName", nameInput); //先不存 等候端檢查重複
document.getElementById("resetUserBtn").textContent = `更換使用者（ 泥現在是 ${nameInput} ）`;
document.getElementById("nameModal").style.display = "none";
socket.emit("register", nameInput);//3.丟到後面檢查重複 會回復fail or ok
}
//4.1 後端回fail
socket.on("register_failed", data => {//check same name
alert(data.error);              // 名稱重複
// localStorage.removeItem("userName");
document.getElementById("nameModal").style.display = "flex";
document.getElementById("nameInput").focus();
});
//4.2 後端回ok 存
socket.on("register_ok", username => {   // backend多送這個事件 ok 才存
localStorage.setItem("userName", username);
document.getElementById("resetUserBtn").textContent =
    `更換使用者（ 泥現在是 ${username} ）`;
document.getElementById("nameModal").style.display = "none";
});

socket.on("user_list", users => {//list user
const countEl = document.getElementById("online-count");
const listEl  = document.getElementById("online-list");
countEl.textContent = users.length;
listEl.innerHTML = "";
users.forEach(name => {
    const li = document.createElement("li");
    li.textContent = name;
    li.style.padding = "4px 0";
    listEl.appendChild(li);
});
});
// 1.網頁載入完成後執行 跳視窗問
window.addEventListener("DOMContentLoaded", () => {
const saved = localStorage.getItem("userName");
if (!saved) {//local 沒存過 等輸入
    document.getElementById("nameModal").style.display = "flex";
} else {//local 有存過了 直接丟後面檢查
    document.getElementById("resetUserBtn").textContent = `更換使用者（ 泥現在是 ${saved} ）`;
    socket.emit("register", saved); //3.丟到後面檢查重複 會回復fail or ok
}

const input = document.getElementById("nameInput");// 讓按下 Enter 可以觸發登入
input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
    e.preventDefault();
    saveUserName(); // 2.透過 saveUserName() 把剛輸入的名字送去後端
    }
});
});

//document.getElementById("resetUserBtn").textContent = `更換使用者（ 泥現在是 ${saved} ）`;// 顯示在按鈕上
// 更換使用者的按鈕
function resetUser() {
localStorage.removeItem("userName");
location.reload(); // 重新整理後 刪之前名字 再重新詢問名字
}
//-------------------------

function confirmReset() { //reset warning 
const confirmed = confirm("這會清空所有選項喔! 確定嗎？");
if (confirmed) { 
    reset();  // 呼叫原本的 reset()
}
}
let lastVersion = null;
const historyList = [];

async function syncStatus(dataFromCheck = null) {
const data = dataFromCheck || await (await fetch("/status")).json();

const resultEl = document.getElementById("result");
const timeEl = document.getElementById("drawTime");

resultEl.textContent = data.result ? `抽中：${data.result}` : "我來幫你選 !!";
timeEl.textContent = data.time ? `抽取時間：${data.time}` : "";

const list = document.getElementById("optionList");
list.innerHTML = "";
(data.options || []).forEach((opt, index) => {
    const li = document.createElement("li");
    li.className = "option-item";

    const idx = document.createElement("span");
    idx.className = "index-label";
    idx.textContent = `${index + 1}.`;

    const span = document.createElement("span");
    span.textContent = opt;
    span.className = "option-text";

    const x = document.createElement("button");
    x.textContent = "❌";
    x.className = "delete-btn";
    x.onclick = async () => {
    await fetch("/remove_option", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option: opt })
    });
    };

    li.appendChild(idx);
    li.appendChild(span);
    li.appendChild(x);
    list.appendChild(li);
});

window.currentOptions = data.options;
}

async function addOption() {
const input = document.getElementById("newOption");
const value = input.value.trim();
if (!value) return;
if ((window.currentOptions || []).includes(value)) {
    alert("慢了 別人填了！");
    input.value = "";
    return;
}
await fetch("/add_option", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ option: value })
});
input.value = "";
}

document.getElementById("newOption").addEventListener("keydown", function (e) {
if (e.key === "Enter") {
    e.preventDefault();
    addOption();
}
});

async function draw() {
if (drawLocked) {
    // alert("抽獎已鎖定！");
    return;
}

const userName = localStorage.getItem("userName");//user id

const resultEl = document.getElementById("result");
const timeEl = document.getElementById("drawTime");
const loadingText = document.getElementById("loadingText");
//precheck isempty no option
const check = await fetch("/status");
const dataCheck = await check.json();
if (!dataCheck.options || dataCheck.options.length === 0) {
    resultEl.textContent = "沒選項你想抽啥 ?";
    resultEl.classList.add("error");  // 加上紅色樣式
    resultEl.style.display = "block";
    return;
}else {
    resultEl.classList.remove("error")
}
// 顯示 loading 文字，隱藏結果
resultEl.style.display = "none";
loadingText.style.display = "block";
timeEl.textContent = "";

loadingText.textContent = "準備中...";
const phrases = [
    "選擇困難中 等我...",
    "正在叫吳澤樺起床...",
    "等待別人給我讚賞...",
    "抽完不要又後悔喔...",
    "不覺得這樣很好玩嗎...",
    "拜託給點情緒價值...",
    "好啦真的要抽了 ! ! !"
];
// 輪流更新文字
loadingIndex = 0;
loadingTimer = setInterval(() => {
    loadingText.textContent = phrases[loadingIndex % phrases.length];
    loadingIndex++;
}, 800); 
// 等秒（模擬抽獎）
await new Promise(resolve => setTimeout(resolve, 6000));
//發出請求
const res = await fetch("/draw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: userName })
});
const data = await res.json();
// 結果顯示
clearInterval(loadingTimer); // 停止輪播
loadingText.style.display = "none";
resultEl.style.display = "block";

if (data.result) {
    resultEl.textContent = `抽中：${data.result}`;
    timeEl.textContent = `抽取時間：${data.time}`;

    resultEl.classList.remove("show"); // 先移除再重新加
    void resultEl.offsetWidth; // force reflow
    resultEl.classList.add("show");
} else {
    resultEl.textContent = data.error || "錯誤";
    timeEl.textContent = "";
}
}
//--------------two btn
let drawLocked = false;

function toggleLock() {
drawLocked = !drawLocked;
const lockBtn = document.getElementById("lockBtn");
const mainBtn = document.getElementById("mainButton");
const quickBtn = document.getElementById("quickDrawBtn");

lockBtn.textContent = drawLocked ? "🔒解鎖" : "鎖定";

if (drawLocked) {
    mainBtn.classList.add("disabled-button");
    quickBtn.classList.add("disabled-button");
} else {
    mainBtn.classList.remove("disabled-button");
    quickBtn.classList.remove("disabled-button");
}
}
async function quickDraw() {

if (drawLocked) {
    // alert("抽獎已鎖定！");
    return;
}
const userName = localStorage.getItem("userName") ;
const resultEl = document.getElementById("result");
const timeEl = document.getElementById("drawTime");
const check = await fetch("/status");
const dataCheck = await check.json();
if (!dataCheck.options || dataCheck.options.length === 0) {
    resultEl.textContent = "沒選項你想抽啥 ?";
    resultEl.classList.add("error");
    resultEl.style.display = "block";
    return;
}else {
    resultEl.classList.remove("error")
}
const res = await fetch("/draw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: userName })
});
const data = await res.json();
if (data.result) {
    resultEl.textContent = `抽中：${data.result}`;
    timeEl.textContent = `抽取時間：${data.time}`;
    resultEl.classList.remove("show");
    void resultEl.offsetWidth;
    resultEl.classList.add("show");
} else {
    resultEl.textContent = data.error || "錯誤";
    timeEl.textContent = "";
}
}
//--------quick draw end----user2option ------------
async function addOnlineUsersToOptions() {
if (!confirm("這會清空之前所有選項只剩用戶喔! 確定嗎？")) return;
// 清空選項 reset() 
await reset();  
// 再抓目前在線使用者
const res = await fetch("/add_online_users", { method: "POST" });
const data = await res.json();
console.log("收到在線使用者：", data);
}
//------user2option end------
async function reset() {
await fetch("/reset_options", { method: "POST" });
}
//---------------------for repo start--------------------------------------------
/* ===== 1. 取得 DOM ===== */
const btn      = document.getElementById('repository-btn');
const drawer   = document.getElementById('repository-drawer');
const closeBtn = document.getElementById('drawer-close');
const backdrop = document.getElementById('drawer-backdrop');
const bodyBox  = document.getElementById('repository-body');
const folderCount = document.getElementById('folder-count');
const addFolderBtn = document.getElementById('add-folder');
const newFolderInput = document.getElementById('new-folder-name');
let drawerLocked = false; //防止連點
/*2. Drawer 開關工具函式 */
function toggleDrawer(open){
if (drawerLocked) return;          // 阻止多次觸發
drawerLocked = true;

if (open) {
    drawer.classList.remove('hidden');        // 先解除 display:none
    // 雙 requestAnimationFrame
    requestAnimationFrame(() => {
    requestAnimationFrame(() => drawer.classList.add('open')); //下一幀才滑入
    });
    backdrop.classList.add('show');   
    
    setTimeout(() => { //防連點鎖1S
    drawerLocked = false;
    }, 1050);
} else {
    drawer.classList.remove('open');        // 先滑出去
    drawer.addEventListener('transitionend', function h(){
    drawer.classList.add('hidden');       // 動畫結束再 display:none
    drawer.removeEventListener('transitionend', h);
    drawerLocked = false; 
    });
    backdrop.classList.remove('show');
}
}

/* 3. 事件註冊*/
btn.addEventListener('click', async ()=>{
const openNow = !drawer.classList.contains('open');
if (openNow) await loadRepository();    // 只在開啟前重新抓資料
toggleDrawer(openNow);
});
closeBtn.addEventListener('click', ()=>toggleDrawer(false));
backdrop.addEventListener('click', ()=>toggleDrawer(false));

async function createFolder() {
const name = newFolderInput.value.trim();
if (!name) return alert("資料夾名稱不可空白");
await fetch("/repository/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
});
newFolderInput.value = "";
await loadRepository();
}

// 點按鈕呼叫它
addFolderBtn.addEventListener("click", createFolder);
newFolderInput.addEventListener("keydown", (e) => {
if (e.key === "Enter") {
    createFolder();
}
});
/*  4. 載入與渲染倉庫 */
async function loadRepository(){
const res = await fetch("/repository/folders");
const data = await res.json();         // [{id,name,items:[{id,name}]}]
folderCount.textContent = `(${data.length})`;
window.repoFolders = data;
// 然後再畫一次畫面
renderRepository(data, window.currentOptions || []);
}

async function renderRepository(folders, optionsNow = []) {
//記目前打開folder
const openFolderIds = new Set();
document.querySelectorAll("#repository-body details[open]").forEach(details => {
    const folderId = details.dataset.folderId;
    if (folderId) openFolderIds.add(folderId);
});
//-----------------------------------
const box = document.getElementById("repository-body");
box.innerHTML = "";                                // 先清空整個側欄
// const optionsNow = window.currentOptions || [];    // 目前候選，用來判斷灰色
    /* ───────── 每個資料夾 ───────── */
folders.forEach(folder => {
    /* === <details> 外殼 === */
    const det = document.createElement("details");  
    det.dataset.folderId = folder.id; 
    det.open =  openFolderIds.has(folder.id);
    /* 摺疊標題 + 刪資料夾*/
    const sum = document.createElement("summary");
    sum.className = "folder-header";
    sum.innerHTML = `${folder.name} (${folder.items.length})`;
    const trash = document.createElement("button");

    trash.className = "del-btn";
    trash.textContent = "✕";
    trash.onclick = () => deleteFolder(folder.id);
    sum.appendChild(trash);
    det.appendChild(sum);

    /* === 內部 <ul> === */
    const ul = document.createElement("ul");  

    /* ─── 現有 item ─── */
    folder.items.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = "option-item selectable-row " +
                (optionsNow.includes(item.name)
                ? "item-inactive"   // 已在候選  灰
                : "item-active");   // 尚未加入  黑
        /* --- 內容：編號 + 文字 --- */
    const indexSpan = document.createElement("span");
    indexSpan.className = "index-label";
    indexSpan.textContent = `${idx + 1}.`;
    const textSpan = document.createElement("span");
    textSpan.className = "option-text";
    textSpan.textContent = item.name;
    /* --- 刪選項按鈕 --- */
    const delBtn = document.createElement("button");
    delBtn.className = "del-btn";
    delBtn.textContent = "✕";
    delBtn.onclick = (e) => {
        e.stopPropagation();           
        deleteItem(item.id, li);       // 原本的流程
    };

    li.append(indexSpan, textSpan, delBtn);
    /* --- 點整列：加入 / 移除 --- */
    li.onclick = async () => {
        const api   = li.classList.contains("item-inactive")
                    ? "/remove_option"
                    : "/add_option";
        await fetch(api, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ option: item.name })   // 你的後端收的是 option 文字
        });
        li.classList.toggle("item-inactive");
        li.classList.toggle("item-active");
    };
    ul.appendChild(li);
    });

    /* ───------------- 新增項目列 -------------─── */
    const liNew = document.createElement("li");
    liNew.className = "item-li";
    liNew.innerHTML = `
    <input class="new-item-input"
            style="flex:1;padding:5px 8px;border:1px solid #ddd;border-radius:4px;"
            placeholder="新增項目">
    <button class="add-btn"> + </button>`;

    // 綁定 input + button
    const inp = liNew.querySelector("input");
    const btn = liNew.querySelector("button");

    // 共用送出函式（Enter 和按鈕都用它）
    async function submitNewItem() {
        const name = inp.value.trim();
        if (!name) return;
        const res = await fetch(`/repository/folders/${folder.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
        });
        if (!res.ok) {
        const info = await res.json();
        alert(info.error || "新增失敗");
        } else {
        inp.value = "";           // 清空輸入
        loadRepository();         // 重載整份 repo 清單
        }
    }
    // 綁定按鈕點擊
    btn.onclick = submitNewItem;

    // 綁定按下 Enter 鍵
    inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
        submitNewItem();
        }
    });

    liNew.querySelector("button").onclick = async () => {
        const inp = liNew.querySelector("input");
        const name = inp.value.trim();
        if (!name) return;

        const res = await fetch(`/repository/folders/${folder.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
        });
        if (!res.ok) {
        const info = await res.json();
        alert(info.error || "新增失敗");
        } else {
        inp.value = "";
        loadRepository();               // 重新載入
        }
    };
    ul.appendChild(liNew);
    det.appendChild(ul);
    box.appendChild(det);
});
}

/* 單筆加入抽籤清單 */
async function addItemToOptions(itemId,btn){
btn.disabled = true;
const res = await fetch(`/repository/items/${itemId}/add`, {method:"POST"});
const data = await res.json();

if (!res.ok && data.error){
    alert(data.error);                // 404 或其它錯
    btn.disabled = false;
    return;
}
/* === 1) 立即更新 UI === */
const li = btn.closest(".item-li"); // 找到那一行 <li>
li.classList.add("disabled");
btn.remove();                       // 拿掉 + 按鈕

/* === 2) 把名字塞進 currentOptions，避免重複插入 === */
const name = btn.dataset.itemName || data.added || "";   // btn or-> data or-> ""
if(name){
    window.currentOptions = (window.currentOptions || []).concat(name);
}
}

/* 刪單一 item：樂觀 UI → 後端 DELETE */
async function deleteItem(itemId, li){
if(!confirm("確定要刪除這個項目？")) return;
const res = await fetch(`/repository/items/${itemId}`, {method:"DELETE"});
if(res.ok){
    li.remove();                      // 立即從畫面移除
    loadRepository();                 // 再重新抓一次數量
}else{
    alert("刪除失敗");
}
}
/* 刪整個資料夾，需二次確認 */
async function deleteFolder(folderId){
if(!confirm("這會刪掉資料夾裡所有項目！確定嗎？")) return;
const res = await fetch(`/repository/folders/${folderId}`, {method:"DELETE"});
if(res.ok){
    loadRepository();                 // 重新渲染側欄
}else{
    alert("刪除資料夾失敗");
}
}
//-----------------------repo end------------------------------------------------
function updateHistoryDisplay() {
const ul = document.getElementById("history-list");
ul.innerHTML = ''; // 清空現有內容
historyList.forEach(item => {
    const li = document.createElement("li");
    li.className = "history-entry";

    li.style.display = "flex";
    li.style.justifyContent = "space-between";
    li.style.listStyle = "none";
    const userSpan = document.createElement("span");
    userSpan.className = "user-label";
    userSpan.textContent = `${item.user} 抽中：`;

    const resultSpan = document.createElement("span");
    resultSpan.className = "result-part";
    resultSpan.textContent = item.result;

    const timeSpan = document.createElement("span");
    timeSpan.className = "time-part";
    timeSpan.textContent = `時間：${item.time}`;
    timeSpan.style.color = "gray";
    
    li.appendChild(userSpan);
    li.appendChild(resultSpan);
    li.appendChild(timeSpan);
    ul.appendChild(li);
});
}

async function loadHistory() {
const res = await fetch("/history");
const data = await res.json();
historyList.length = 0;
historyList.push(...data);
updateHistoryDisplay(); 
}
loadHistory();
syncStatus();


socket.on("connect", () => {
console.log("WebSocket 已連線");
});

socket.on("history_update", (data) => {
console.log("收到歷史紀錄更新：", data);
historyList.length = 0;
historyList.push(...data);
updateHistoryDisplay();
});
socket.on("status_update", (data) => {
console.log("收到最新狀態：", data);
syncStatus(data);  // 直接呼叫原本處理邏輯
renderRepository(window.repoFolders, data.options);
});

