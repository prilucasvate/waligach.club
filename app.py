from flask import Flask, request, jsonify, render_template, redirect, url_for, session, abort
import random,uuid
import secrets # 真隨機
import json, os, threading, pathlib
from datetime import datetime
from flask_socketio import SocketIO, emit#  新增  WebSocket


current_result = None
all_options = []
repository = []  
draw_time = None
version = 0
history = []
lock_status = False
online_users = {}   # { sid: username }
drawing_in_progress = False # 是否正在抽籤

DATA_FILE = pathlib.Path("optiondata.json")   # 指向檔案
SAVE_LOCK = threading.Lock()                 # 寫檔互斥鎖 防止兩人互寫

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")  # 新增 for WebSocket 任何網域都能開這條 WebSocket cors_allowed_origins=["https://waligach.club"] 

def broadcast_user_list():
    socketio.emit("user_list", list(online_users.values()))

def broadcast_status():
    socketio.emit("status_update", {
        "options": all_options,
        "result": current_result,
        "time": draw_time,
        "version": version
    })

def broadcast_lock():
    socketio.emit("lock_update", {"locked": lock_status})


def load_state():
    if DATA_FILE.exists():                       # 檔案存在 
        with DATA_FILE.open("r", encoding="utf-8") as f:
            state = json.load(f)                 # 讀進 dict
        # 把檔案中的資料塞回程式全域變數
        global all_options, history, lock_status, version,repository
        all_options = state.get("options", [])
        history     = state.get("history", [])
        lock_status = state.get("lock", False)
        version     = state.get("version", 0)
        repository = state.get("repository", []) #use key get value if not rtn [] 
        print(f"[INFO] read {len(all_options)} options, lock_status={lock_status}")
    else:
        # 若沒有檔，就用預設空白狀態
        print("[INFO] can't find optiondata.json")

def save_state():
    with SAVE_LOCK:                              # 進入互斥鎖 確保只有一條執行緒寫
        state = {                                # 把目前狀態打包成 dict
            "options":  all_options,
            "history":  history,
            "repository": repository,
            "lock":     lock_status,
            "version":  version
        }
        tmp = DATA_FILE.with_suffix(".tmp")      # 產生暫存檔路徑 xxx.tmp
        tmp.write_text(                          # 先寫到暫存檔
            json.dumps(state, ensure_ascii=False, indent=2) #indent=2 加縮排
        )
        tmp.replace(DATA_FILE)                   #  rename to original file

def new_id(prefix="x"): 
    return prefix + uuid.uuid4().hex[:6]    #給hash x+xxxxxx

def find_folder(fid: str):              #在repo id欄位找 等於fid的dict 回傳
    for f in repository:
        if f["id"] == fid:
            return f
    return None
     
# ----------------------------------------------------------
@app.route("/")
def homepage():
    return render_template("index.html")
#------------- travel -----------------
app.secret_key = "thisisfortriptokoreawithfriends"  # session secret key
TRAVEL_PASSWORD = "哇哩"  # 密碼
@app.route("/korea", methods=["GET", "POST"])
def travel_login():
    if request.method == "POST":
        pw = request.form.get("password", "")
        if pw == TRAVEL_PASSWORD:
            session["travel_authed"] = True
            return redirect(url_for("travel"))
        else:
            return "密碼錯誤", 401
    # 登入畫面
    return """
    <form method="post">
        <input type="text" name="password" placeholder="我是誰？(2字)">
        <button type="submit">登入</button>
    </form>
    """

@app.route("/travel")
def travel():
    if not session.get("travel_authed"):
        abort(404)  # 或改成 redirect(url_for("travel_login"))
    return render_template("travel.html")
#-------------------------------------
@app.route("/add_option", methods=["POST"])
def add_option():
    global all_options, version
    data = request.get_json()
    new_option = data.get("option", "").strip()
    if new_option and new_option not in all_options:
        all_options.append(new_option)
        version += 1
        broadcast_status()
        save_state()
    return jsonify({"options": all_options})

@app.route("/remove_option", methods=["POST"])
def remove_option():
    global all_options, version
    data = request.get_json()
    to_remove = data.get("option", "").strip()
    if to_remove in all_options:
        all_options.remove(to_remove)
        version += 1
        broadcast_status()
        save_state()
    return jsonify({"options": all_options})

@app.route("/draw", methods=["POST"])
def draw():
    global current_result, draw_time, version, history, drawing_in_progress
    if drawing_in_progress:
        return jsonify({"error": "抽獎中"}), 429
    data = request.get_json()
    mode = data.get("mode", "normal")  # 取得抽獎模式，預設為 normal
    if not all_options:
        current_result = None
        draw_time = None
        return jsonify({"error": "?? 沒東西是要選啥"}), 400 #frontend will precheck
    # 開始抽獎
    drawing_in_progress = True 
    version += 1
    snapshot_options = list(all_options)  # 複製一份選項清單
    # -------- 核心抽獎邏輯 --------
    current_result = secrets.choice(all_options)
    # ------------------------------
    draw_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    user = data.get("user")
    #  更新歷史紀錄並廣播給所有人
    entry = {"result": current_result, "time": draw_time, "user":user }
    history.insert(0, entry)
    history = history[:5]
    
    socketio.emit("draw_started", {
        "options": snapshot_options,
        "winner": current_result,
        "time": draw_time,
        "user": user,
        "mode": mode,
    })
    socketio.emit("history_update", history)  # 廣播 WebSocket
    broadcast_status() 
    save_state()
    drawing_in_progress = False
    return jsonify({"result": current_result, "time": draw_time})

@app.route("/draw/unlock", methods=["POST"])
def draw_unlock():
    global drawing_in_progress
    drawing_in_progress = False
    return jsonify({"ok": True})

@app.route("/status")
def status():
    return jsonify({
        "options": all_options,
        "result": current_result,
        "time": draw_time,
        "version": version
    })


@app.route("/reset_options", methods=["POST"])
def reset():
    global all_options, current_result, draw_time, version
    all_options = []
    current_result = None
    draw_time = None
    version += 1
    broadcast_status()
    save_state()
    return jsonify({"message": "已重設"})

@app.route("/history", methods=["GET", "POST"])
def history_route():
    global history
    if request.method == "GET":
        return jsonify(history)
    elif request.method == "POST":
        data = request.json
        entry = {
            "result": data["result"],
            "time": data["time"]
        }
        history.insert(0, entry)
        history = history[:5]
        socketio.emit("history_update", history)  #  廣播 WebSocket
        return jsonify({"status": "ok"})

@app.route("/history/reset", methods=["POST"])  #  新增路由：清空歷史並廣播
def reset_history():
    global history
    history.clear()
    socketio.emit("history_update", history)
    save_state()
    return jsonify({"status": "cleared"})

# 使用者送出暱稱時
@socketio.on("register")
def handle_register(username):
    # 若名稱已存在，回傳失敗訊息給該連線
    if username in online_users.values():
        emit("register_failed", {"error": "名稱已被使用"})
        return
    online_users[request.sid] = username
    emit("register_ok", username, room=request.sid) #私訊特定房間
    broadcast_user_list()
# 斷線清除
@socketio.on("disconnect")
def handle_disconnect():
    if request.sid in online_users:
        del online_users[request.sid]
        broadcast_user_list()

@socketio.on("toggle_lock")
def handle_toggle_lock():
    global lock_status
    lock_status = not lock_status
    broadcast_lock()
    save_state()
    
@app.route("/add_online_users", methods=["POST"])
def add_online_users():
    global all_options, version
    # 取得所有目前在線使用者的名稱
    users = list(online_users.values())  # online_users 是 {sid: username}
    if not users:
        return jsonify({"error": "沒有在線的使用者"}), 400
    all_options = users.copy()  # 取代現有選項
    version += 1
    broadcast_status()  # 廣播更新選項
    save_state()
    
    return jsonify({"result": current_result, "time": draw_time})
# ------------for repo start--------------------------------------------
@app.route("/repository/folders")
def list_folders():
    return jsonify(repository)

@app.route("/repository/folders", methods=["POST"]) #加folder
def add_folder():
    global repository
    # 取前端傳來的資料夾名稱
    name = request.json.get("name", "").strip()
    if not name:
        return jsonify({"error": "名稱不可空白"}), 400
    # 檢查重複
    if any(f["name"] == name for f in repository):
        return jsonify({"error": "資料夾已存在"}), 409
    # 建立資料夾 dict
    folder = {"id": new_id("f"), "name": name, "items": []}
    repository.append(folder)
    save_state()          # 存檔
    return jsonify(folder), 201

@app.route("/repository/folders/<fid>/items", methods=["POST"]) #加項目
def add_item(fid):
    folder = find_folder(fid)
    if not folder:
        return jsonify({"error": "folder not found"}), 404
    name = request.json.get("name", "").strip()
    if not name:
        return jsonify({"error": "名稱不可空白"}), 400
    if any(i["name"] == name for i in folder["items"]):
        return jsonify({"error": "項目重複"}), 409
    item = {"id": new_id(fid+"i"), "name": name} # item id : fxxxxxxxixxxxxx
    folder["items"].append(item)
    save_state()
    return jsonify(item), 201

@app.route("/repository/folders/<fid>/add", methods=["POST"])   #把資料夾全加進選項
def add_folder_to_options(fid):
    folder = find_folder(fid)
    if not folder:
        return jsonify({"error":"folder not found"}), 404
    # 目前沒 需要增加的選項 new_names
    new_names = [i["name"] for i in folder["items"] if i["name"] not in all_options] 
    if not new_names:
        return jsonify({"info":"全都都有了"}), 200

    all_options.extend(new_names) #加整條新的進選項
    global version
    version += 1
    save_state()
    broadcast_status()      # 既有函式，推送給所有前端

    return jsonify({"added": new_names}), 200

@app.route("/repository/items/<iid>/add", methods=["POST"])   #把項目變選項
def add_item_to_options(iid):
    # 把 repository 中指定 id 的單一 item 加進 all_options。
    # 成功  200 {"added": "珍奶"}
    # 已存在  200 {"info": "已在候選"}
    # 找不到  404
    # 在所有資料夾裡尋找item check legal
    target = None
    for folder in repository:
        for item in folder["items"]:
            if item["id"] == iid:
                target = item
                break
        if target: break

    if not target:
        return jsonify({"error": "item 不存在"}), 404
    #  檢查是否已在候選
    if target["name"] in all_options:
        return jsonify({"info": "已在選項中"}), 200
    # 加進抽籤清單
    all_options.append(target["name"]) #找到名稱加進選項
    global version
    version += 1
    save_state()          # 存
    broadcast_status()      
    return jsonify({"added": target["name"]}), 200

@app.route("/repository/items/<iid>", methods=["DELETE"])  #刪item
def delete_item(iid):
    # 在倉庫裡找到該 id 的 item 並刪除
    for folder in repository:
        before = len(folder["items"])
        folder["items"] = [i for i in folder["items"] if i["id"] != iid] #留沒刪的
        if len(folder["items"]) != before:          # 長度不同 有刪到
            save_state()
            return jsonify({"ok": True})
    return jsonify({"error": "item 不存在"}), 404

@app.route("/repository/folders/<fid>", methods=["DELETE"]) #刪資料夾
def delete_folder(fid):
    global repository
    before = len(repository)
    repository = [f for f in repository if f["id"] != fid]
    if len(repository) != before:
        save_state()
        return jsonify({"ok": True})
    return jsonify({"error": "folder 不存在"}), 404
    

# -----------------------------repo end------------------------
# 改用 socketio.run() 取代 app.run()
if __name__ == "__main__":
    load_state()   
    socketio.run(app, host="0.0.0.0", port=8084, debug=True)
 # made by waligach in June 2025