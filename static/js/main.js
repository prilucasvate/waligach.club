
const socket = io();     //  一開始就連線
let isDrawing = false;  // 抽獎中狀態
let wheelAnimationFrameId = null;   // requestAnimationFrame 的 ID
let wheelSpinning = false;          // 現在是否有輪盤在轉
let pendingHistoryData = null;

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
resultEl.style.display = "block";
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

isDrawing = false;

async function draw() {
    if (drawLocked|| isDrawing) {
        // alert("抽獎已鎖定！"); 或正在抽 無視
        return;
    }
    isDrawing = true;
    const userName = localStorage.getItem("userName");//user id

    const resultEl = document.getElementById("result");
    const timeEl = document.getElementById("drawTime");
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
    timeEl.textContent = "";

    // const phrases = [
    //     "選擇困難中 等我...",
    //     "正在叫吳澤樺起床...",
    //     "等待別人給我讚賞...",
    //     "抽完不要又後悔喔...",
    //     "不覺得這樣很好玩嗎...",
    //     "拜託給點情緒價值...",
    //     "好啦真的要抽了 ! ! !"
    // ];
    // 輪流更新文字
    
    // 等秒（模擬抽獎）
    await new Promise(resolve => setTimeout(resolve, 10));
    //發出請求
    const res = await fetch("/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: userName, mode: "normal" })
    });
    const data = await res.json();

    if (!res.ok) {
        // 只有錯的時候，才在這裡顯示訊息
        resultEl.style.display = "block";
        resultEl.textContent = data.error || "錯誤";
        timeEl.textContent = "";
        isDrawing = false;  // ← 這次抽獎失敗了，要把狀態解鎖
        return;
    }       

    // 正常情況：不在這裡顯示結果
    // 讓 draw_started → 轉盤動畫 → status_update + history_update 決定什麼時候顯示最終結果
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
    body: JSON.stringify({ user: userName, mode: "quick" })
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
if (!Array.isArray(folders)) {
    console.warn("renderRepository called with invalid folders:", folders);
    return;
}
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

// 監聽 WebSocket 事件
socket.on("connect", () => {
    console.log("WebSocket 已連線");
    isDrawing = false;
    wheelSpinning = false;
});

socket.on("history_update", (data) => {
    console.log("收到歷史紀錄更新：", data);
    
    // 如果轉盤正在轉，先存起來，不要馬上更新 UI
    if (wheelSpinning) {
        pendingHistoryData = data;
    } else {
        // 沒在轉，直接更新
        historyList.length = 0;
        historyList.push(...data);
        updateHistoryDisplay();
    }
});
socket.on("status_update", (data) => {
    console.log("收到最新狀態：", data);
    
    // 如果轉盤正在轉，先存起來，不要馬上更新結果文字
    if (wheelSpinning) {
        // 注意：repository 還是可以即時更新，不影響劇透
        if (Array.isArray(window.repoFolders)) {
            renderRepository(window.repoFolders, data.options);
        }
    } else {
        // 沒在轉，直接更新
        syncStatus(data);
        if (window.repoFolders) { 
            renderRepository(window.repoFolders, data.options);
        }
    }
});

//--------------------- for wheel start---------------------------------

// 算出：讓中獎那一塊的「中心」剛好在指針 (-90°) 的角度
function getTargetAngle(options, winnerText) {
    const N = options.length;
    if (!N) return 0;                     // 沒選項就回 0

    const slice = (2 * Math.PI) / N;      // 每一塊扇形的弧度
    let winnerIndex = options.indexOf(winnerText);
    if (winnerIndex < 0) winnerIndex = 0; // 找不到就當作第 0 塊

    const pointerAngle = -Math.PI / 2;    // 指針在正上方
    // 指針角度 - 那一塊中心角度
    return pointerAngle - (winnerIndex + 0.5) * slice;
}

// 共用：畫輪盤；angle 是目前旋轉角度；highlightWinner 決定要不要把中獎那格塗黃
function renderWheel(options, winnerText, angle, highlightWinner) {
    const canvas = document.getElementById("wheel-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 12;

    if (!options || options.length === 0) {
        ctx.clearRect(0, 0, w, h);
        return;
    }

    const N = options.length;
    const slice = (2 * Math.PI) / N;

    let winnerIndex = options.indexOf(winnerText);
    if (winnerIndex < 0) winnerIndex = 0;

    // 預設：若沒傳 highlightWinner，就當作 true（停好時畫黃）
    if (typeof highlightWinner === "undefined") {
        highlightWinner = true;
    }

    const baseAngle = (typeof angle === "number")
        ? angle
        : getTargetAngle(options, winnerText);

    ctx.clearRect(0, 0, w, h);

    // --- 顏色設計：不用亂數，只根據 index 穩定決定顏色 ---
    const baseColors = ["#cfe9ff", "#dff8e7", "#f2dfff"]; // 一般色調
    const colorIndexForSlice = [];

    for (let i = 0; i < N; i++) {
        // 先用一個「基本模式」：0,1,2,0,1,2...
        let idx = i % baseColors.length;

        // 不能跟前一片同色
        if (i > 0 && idx === colorIndexForSlice[i - 1]) {
            idx = (idx + 1) % baseColors.length;
        }
        // 如果是最後一片，又跟第一片同色，就再往下一個顏色挪一下
        if (i === N - 1 && idx === colorIndexForSlice[0]) {
            idx = (idx + 1) % baseColors.length;
            // 再檢查一次不要跟前一片撞色
            if (i > 0 && idx === colorIndexForSlice[i - 1]) {
                idx = (idx + 1) % baseColors.length;
            }
        }

        colorIndexForSlice.push(idx);
    }

    options.forEach((text, i) => {
        const start = baseAngle + i * slice;
        const end   = start + slice;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, start, end);
        ctx.closePath();

        const isWinner = highlightWinner && (i === winnerIndex);

        if (isWinner) {
            ctx.fillStyle = "#ffacb7";             // 中獎格：黃
        } else {
            const colorIdx = colorIndexForSlice[i]; // 其他格：基本色
            ctx.fillStyle = baseColors[colorIdx];
        }
        ctx.fill();

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        let label = String(text);
        if (label.length > 7) {
            label = label.slice(0, 7);
        }
        const centerAngle = start + slice / 2;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(centerAngle);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#333";
        ctx.font = 'bold 28px "Noto Sans TC", "Zen Maru Gothic", sans-serif';
        ctx.fillText(label, r - 18, 0);
        ctx.restore();

        // --- 畫中心圓圈 ---
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, 2 * Math.PI);
        ctx.fillStyle = "#9699bf";      // 中間紅色點
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, 16, 0, 2 * Math.PI); // 外圈稍微大一點
        ctx.strokeStyle = "#ffffff";         // 外白圈
        ctx.lineWidth = 4;
        ctx.stroke();
    });
}


// 讓輪盤從快速轉 → 減速 → 停在中獎那格
function spinWheel(options, winnerText) {
    const overlay = document.getElementById("wheel-overlay");
    if (!overlay || !options || options.length === 0) return;

    const resultEl = document.getElementById("result");
    const timeEl = document.getElementById("drawTime");
    if (resultEl) resultEl.style.visibility = "hidden";
    if (timeEl)   timeEl.style.visibility   = "hidden";

    if (wheelAnimationFrameId !== null) {
        cancelAnimationFrame(wheelAnimationFrameId);
        wheelAnimationFrameId = null;
    }

    overlay.classList.remove("hidden");
    wheelSpinning = true;
    isDrawing = true;

    const centerAngle = getTargetAngle(options, winnerText);
    // 每一片扇形的寬度
    const slice = (2 * Math.PI) / options.length;
    // 在中獎扇形裡隨機偏移
    const jitter = (Math.random() - 0.5) * slice * 0.98;  // 避免太靠邊
    const targetAngle = centerAngle + jitter;

    const extra = Math.random() * Math.PI * 2;
    const rounds = 6 + Math.random() * 3; // 8~11圈
    const startAngle = targetAngle + extra + rounds * 2 * Math.PI;

    const duration = 6000;
    const startTime = performance.now();

    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function frame(now) {
        const elapsed = now - startTime;
        let t = elapsed / duration;
        if (t > 1) t = 1;

        const eased = easeOutCubic(t);
        const currentAngle = startAngle + (targetAngle - startAngle) * eased;

        // 動畫過程：不 highlight winner（全部同色）
        renderWheel(options, winnerText, currentAngle, false);

        if (t < 1 && wheelSpinning) {
            wheelAnimationFrameId = requestAnimationFrame(frame);
        } else {
            // 最後一幀：強制畫在 targetAngle，這次才 highlight winner
            renderWheel(options, winnerText, targetAngle, true);
            wheelSpinning = false;
            isDrawing = false;

            if (pendingHistoryData) {
                historyList.length = 0;
                historyList.push(...pendingHistoryData);
                updateHistoryDisplay();
                pendingHistoryData = null; // 清空暫存
            }

            if (resultEl) resultEl.style.visibility = "visible";
            if (timeEl)   timeEl.style.visibility   = "visible";
            fetch("/draw/unlock", { method: "POST" })
                .catch(err => console.error("unlock failed", err));
        }
    }

    wheelAnimationFrameId = requestAnimationFrame(frame);
}



// 關閉輪盤 overlay
function closeWheel() {
    const overlay = document.getElementById("wheel-overlay");
    if (overlay) {
        overlay.classList.add("hidden");
    }

    // 如果有動畫在跑，停掉
    if (wheelAnimationFrameId !== null) {
        cancelAnimationFrame(wheelAnimationFrameId);
        wheelAnimationFrameId = null;
    }

    wheelSpinning = false;
    isDrawing = false;
}

// 進站時綁定關閉邏輯（X 按鈕 + 點背景）
window.addEventListener("DOMContentLoaded", () => {
    const overlay = document.getElementById("wheel-overlay");

    if (overlay) {
        overlay.addEventListener("click", (e) => {
            // 點到背景（不是 canvas，不是內部內容）
            if (e.target.id === "wheel-overlay") {
                if (!wheelSpinning) {
                    closeWheel();
                }
            }
        });
    }
});


// 多人同步：監聽收到後端的 draw_started 就打開輪盤
socket.on("draw_started", (data) => {
    console.log("收到 draw_started 事件：", data);
    if (data.mode === "quick") {
        return; // 如果是快速抽，直接結束，不跑下面的 spinWheel
    }
    const options = data.options || [];
    const winner  = data.winner;

    if (!options.length || !winner) return;

    // 用這次抽獎的 options + 中獎結果畫盤
    //renderWheel(data.options || [], data.winner);
    spinWheel(options, winner);
    // 右上角結果 / 歷史，本來就會透過 status_update / history_update 被更新，
    // 這裡只負責顯示輪盤畫面就好。
});

//---------------------wheel end---------------------------------

