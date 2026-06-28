from flask import Flask, request, jsonify, g, send_from_directory
from flask_cors import CORS, cross_origin
from threading import Timer
import sqlite3
import webbrowser
import sys
import os
import threading
import webview
import time

def resource_path(relative_path):
    """ PyInstaller で exe 化した時に正しいパスを返す """
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(relative_path)

app = Flask(
    __name__,
    template_folder=resource_path("templates"),
    static_folder=resource_path("static")
)
CORS(app)

DB_NAME = "todo.db"

# --- DB 初期化 ---
def init_db():
    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_id INTEGER,
            title TEXT NOT NULL,
            done INTEGER DEFAULT 0,
            position integer DEFAULT 0,
            notes TEXT,
            color TEXT,
            folded integer DEFAULT 0,
            FOREIGN KEY(parent_id) REFERENCES tasks(id)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS subtasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            done INTEGER DEFAULT 0,
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        )
    """)

    conn.commit()
    conn.close()

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_NAME)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()

@app.route("/")
def index():
    return send_from_directory(resource_path("templates"), "index.html")

@app.get("/tasks")
def get_tasks():
    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()

    cur.execute("""
        SELECT id, parent_id, title, done, position, notes, color, folded
        FROM tasks 
        ORDER BY parent_id, position
    """)
    rows = cur.fetchall()
    conn.close()

    # id → task の辞書
    tasks = {r[0]: {
        "id": r[0], 
        "parent_id": r[1], 
        "title": r[2], 
        "done": bool(r[3]), 
        "position": r[4],
        "notes": r[5],
        "color": r[6],
        "folded": r[7],
        "children": []
        }
    for r in rows
    }

    # 階層構造を作る
    root = []
    for t in tasks.values():
        if t["parent_id"] is None:
            # 親がいない
            root.append(t)
        else:
            # 親がいる
            parent = tasks.get(t["parent_id"])
            if parent:
                parent["children"].append(t)
    return jsonify(root)

# --- タスク追加 ---
@app.post("/tasks")
def add_task():
    data = request.json
    title = data.get("title", "")
    parent_id = data.get("parent_id")  # 親タスクなら None

    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()

    cur.execute("""
        SELECT COALESCE(MAX(position), -1) FROM tasks WHERE parent_id IS ?
    """, (parent_id,))
    max_pos = cur.fetchone()[0]

    new_position = max_pos + 1

    cur.execute(
        "INSERT INTO tasks (parent_id, title, done, position) VALUES (?, ?, 0, ?)",
        (parent_id, title, new_position)
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()

    return jsonify({"id": new_id, "parent_id": parent_id, "title": title}), 201

@app.put("/tasks/<int:task_id>/done")
def update_task_done(task_id):
    data = request.json
    done = 1 if data.get("done") else 0

    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()
    cur.execute("UPDATE tasks SET done = ? WHERE id = ?", (done, task_id))
    conn.commit()
    conn.close()

    return jsonify({"id": task_id, "done": bool(done)})

@app.post("/tasks/<int:task_id>/subtasks")
def add_subtask(task_id):
    data = request.json
    title = data.get("title", "")

    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO subtasks (task_id, title) VALUES (?, ?)",
        (task_id, title)
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()

    return jsonify({"id": new_id, "task_id": task_id, "title": title}), 201

def update_task_done(task_id):
    data = request.json
    done = 1 if data.get("done") else 0

    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()
    cur.execute("UPDATE tasks SET done = ? WHERE id = ?", (done, task_id))
    conn.commit()
    conn.close()

    return jsonify({"id": task_id, "done": bool(done)})

@app.put("/subtasks/<int:subtask_id>/done")
def update_subtask_done(subtask_id):
    data = request.json
    done = 1 if data.get("done") else 0

    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()
    cur.execute("UPDATE subtasks SET done = ? WHERE id = ?", (done, subtask_id))
    conn.commit()
    conn.close()

    return jsonify({"id": subtask_id, "done": bool(done)})

@app.delete("/tasks/<int:task_id>")
def delete_task(task_id):
    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()

    # 子孫タスクも全部削除（再帰的）
    def delete_recursive(id):
        cur.execute("SELECT id FROM tasks WHERE parent_id = ?", (id,))
        children = cur.fetchall()
        for c in children:
            delete_recursive(c[0])
        cur.execute("DELETE FROM tasks WHERE id = ?", (id,))

    delete_recursive(task_id)

    conn.commit()
    conn.close()

    return jsonify({"deleted": task_id})

@app.delete("/subtasks/<int:subtask_id>")
def delete_subtask(subtask_id):
    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()

    cur.execute("DELETE FROM subtasks WHERE id = ?", (subtask_id,))

    conn.commit()
    conn.close()

    return jsonify({"deleted": subtask_id})


@app.put("/tasks/<int:task_id>/title")
def update_task_title(task_id):
    data = request.json
    new_title = data.get("title", "")

    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()
    cur.execute("UPDATE tasks SET title = ? WHERE id = ?", (new_title, task_id))
    conn.commit()
    conn.close()

    return jsonify({"id": task_id, "title": new_title})


@app.post("/tasks/<int:task_id>/reorder")
@cross_origin()
def reorder_task(task_id):
    data = request.json
    new_position = data.get("position")
    parent_id = data.get("parent_id")

    if new_position is None:
        return jsonify({"error": "position is required"}), 400

    # DB 更新
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        UPDATE tasks
        SET position = ?, parent_id = ?
        WHERE id = ?
    """, (new_position, parent_id, task_id))

    conn.commit()
    conn.close()

    return jsonify({"status": "ok"})

# メモ欄と色の更新
@app.route("/tasks/<int:task_id>", methods=["PATCH"])
def update_task_memo(task_id):
    data = request.json
    notes = data.get("notes", "")
    color = data.get("color", "")

    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()
    if notes is not None:
        cur.execute("""
            UPDATE tasks 
            SET notes = ? 
            WHERE id = ?
        """, (notes, task_id))

    if color is not None:
        cur.execute("""
            UPDATE tasks 
            SET color = ? 
            WHERE id = ?
         """, (color, task_id))

    conn.commit()
    conn.close()

    return jsonify({"id": task_id, "notes": notes})

@app.route("/toggle_done_recursive", methods=["POST"])
def toggle_done_recursive():
    data = request.json
    task_id = data.get("id")
    done = data.get("done")

    conn = get_db()
    conn.execute("""
        WITH RECURSIVE descendants AS (
            SELECT id FROM tasks WHERE id = ?
            UNION ALL
            SELECT t.id FROM tasks t
            JOIN descendants d ON t.parent_id = d.id
        )
        UPDATE tasks SET done = ?
        WHERE id IN (SELECT id FROM descendants)
    """, (task_id, done))

    conn.commit()
    return jsonify({"status": "ok"})

@app.route("/unset_done_ancestors", methods=["POST"])
def unset_done_ancestors():
    data = request.json
    task_id = data.get("id")

    conn = get_db()
    conn.execute("""
        WITH RECURSIVE ancestors AS (
            SELECT id, parent_id FROM tasks WHERE id = ?
            UNION ALL
            SELECT t.id, t.parent_id
            FROM tasks t
            JOIN ancestors a ON t.id = a.parent_id
        )
        UPDATE tasks SET done = 0
        WHERE id IN (SELECT id FROM ancestors)
    """, (task_id,))
    conn.commit()

    return jsonify({"status": "ok"})

@app.route("/update_fold_state", methods=["POST"])
def update_fold_state():
    data = request.json
    task_id = data.get("id")
    folded = 1 if data.get("folded") else 0

    conn = get_db()
    conn.execute("""
        UPDATE tasks
        SET folded = ?
        WHERE id = ?
    """, (folded,task_id)
    )
    conn.commit()

    return jsonify({"status": "OK"})

def open_browser():
    webbrowser.open("http://127.0.0.1:5000")

def start_flask():
    app.run(host="127.0.0.1", port=5000, debug=False)

if __name__ == "__main__":
    init_db()

    #Timer(2, open_browser).start()
    #app.run(debug=True)
    #app.run()

    # Flaskを別スレッドで起動
    flask_thread = threading.Thread(target=start_flask, daemon=True)
    flask_thread.start()

    # Flask起動を待つ
    time.sleep(1)

    # PyWebView ウィンドウを開く
    window = webview.create_window(
        "Task App", 
        "http://127.0.0.1:5000",
        width=900,
        height=700,
        resizable=True
    )

    # ウィンドウを閉じたらアプリ終了
    webview.start(gui='qt', debug=False)

    # ここに来たら、ウィンドウが閉じられている
    os._exit(0)
