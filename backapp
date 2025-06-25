from flask import Flask, request, jsonify, render_template, redirect, url_for
import random
from datetime import datetime

#  新增  WebSocket
from flask_socketio import SocketIO, emit

def broadcast_status():
    socketio.emit("status_update", {
        "options": all_options,
        "result": current_result,
        "time": draw_time,
        "version": version
    })


app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")  # 新增 for WebSocket

online_users = {}   # { sid: username }
def broadcast_user_list():
    socketio.emit("user_list", list(online_users.values()))

current_result = None
all_options = []
draw_time = None
version = 0
history = []
lock_status = False


def broadcast_lock():
    socketio.emit("lock_update", {"locked": lock_status})

@app.route("/")
def homepage():
    return render_template("index.html")
# ------------for travel
# @app.route("/travel")
# def travel_page():
#     return render_template("travel.html")
messages = []

@app.route("/travel", methods=["GET", "POST"])
def travel_page():
    global messages
    if request.method == "POST":
        msg = request.form.get("message", "").strip()
        if msg:
            messages.append(msg)
        return redirect(url_for("travel_page"))
    # 不管 GET 或 POST 結果都會 
    return render_template("travel.html", messages=messages)
@app.route("/submit_message", methods=["POST"])
def submit_message():
    data = request.get_json()
    msg = data.get("message", "").strip()
    user = data.get("user", "").strip()
    if msg and user:
        full_msg = f"{user}:{msg}"
        messages.append(full_msg)
        return jsonify({"success": True, "message": full_msg})
    return jsonify({"success": False}), 400
@socketio.on("new_comment")
def handle_new_comment(data):
    msg = data.get("message", "").strip()
    user = data.get("user", "").strip()
    if msg and user:
        messages.append(f"{user}:{msg}")
        socketio.emit("broadcast_comment", {"user": user, "message": msg})
# ------------for travel end

@app.route("/add_option", methods=["POST"])
def add_option():
    global all_options, version
    data = request.get_json()
    new_option = data.get("option", "").strip()
    if new_option and new_option not in all_options:
        all_options.append(new_option)
        version += 1
        broadcast_status()
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
    return jsonify({"options": all_options})

@app.route("/draw", methods=["POST"])
def draw():
    global current_result, draw_time, version, history
    data = request.get_json()
    if not all_options:
        current_result = None
        draw_time = None
        return jsonify({"error": "?? 沒東西是要選啥"}), 400 #frontend will precheck 
    version += 1
    current_result = random.choice(all_options)
    draw_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    user = data.get("user")
    #  更新歷史紀錄並廣播給所有人
    entry = {"result": current_result, "time": draw_time, "user":user }
    history.insert(0, entry)
    history = history[:5]
    socketio.emit("history_update", history)  # 廣播 WebSocket
    broadcast_status() 
    return jsonify({"result": current_result, "time": draw_time})

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

@app.route("/draw_online_users", methods=["POST"])
def draw_online_users():
    global all_options, current_result, draw_time, version, history
    # 取得所有目前在線使用者的名稱
    users = list(online_users.values())  # online_users 是 {sid: username}
    if not users:
        return jsonify({"error": "沒有在線的使用者"}), 400
    all_options = users.copy()  # 取代現有選項
    version += 1
    broadcast_status()  # 廣播更新選項
    # 自動抽籤
    current_result = random.choice(all_options)
    draw_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    data = request.get_json()
    user = data.get("user", "系統")  # 誰按下的按鈕
    # 更新歷史
    entry = {"result": current_result, "time": draw_time, "user": user}
    history.insert(0, entry)
    history = history[:5]
    socketio.emit("history_update", history)

    return jsonify({"result": current_result, "time": draw_time})

# 改用 socketio.run() 取代 app.run()
if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=8082, debug=True)
 # made by waligach in June 2025