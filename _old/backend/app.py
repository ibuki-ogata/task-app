from flask import Flask, request, jsonify, g
from flask_cors import CORS, cross_origin
from threading import Timer
import sqlite3
import webbrowser

app = Flask(__name__)
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

@app.get("/tasks")
def get_tasks():
    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()

    cur.execute("SELECT id, parent_id, title, done, position FROM tasks ORDER BY parent_id, position")
    rows = cur.fetchall()
    conn.close()

    # id → task の辞書
    tasks = {r[0]: {
        "id": r[0], 
        "parent_id": r[1], 
        "title": r[2], 
        "done": bool(r[3]), 
        "position": r[4],
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
                #tasks[t["parent_id"]]["children"].append(t)
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

    return jsonify({"status": "ok"})

def open_browser():
    webbrowser.open("http://localhost:5000")

if __name__ == "__main__":
    init_db()
    Timer(2, open_browser).start()
    #app.run(debug=True)
    app.run()
