const API_URL = "http://127.0.0.1:5000";
let taskFoldState = {};
let lastFocusedAddInputId = null;

document.getElementById("rootTaskAddBtn").onclick = () => {
    const input = document.getElementById("rootTaskInput");
    const title = rootInput.value.trim();
    if(!title){
        return;
    }
    addTask(null, input.value);
    input.value = "";
};

const rootInput = document.getElementById("rootTaskInput");
rootInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        const title = rootInput.value.trim();
        if(!title){
            return;
        }
        addTask(null, rootInput.value);
        rootInput.value = "";
    }
});

async function loadTasks() {
    const res = await fetch(`${API_URL}/tasks`);
    const tasks = await res.json();

    const list = document.getElementById("taskList");
    list.innerHTML = "";

    new Sortable(list, {
        animation: 150,
        ghostClass: "sortable-ghost",
        draggable: "li",
        onEnd: (evt) => {
            const items = Array.from(evt.to.children);

            items.forEach((item, index) => {
                const id = item.dataset.id;

                fetch(`${API_URL}/tasks/${id}/reorder`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        position: index,
                        parent_id: null   // ← 最上位は親なし
                    })
                });
            });
        }
    });

    // 描写の再帰的呼び出し
    tasks.forEach(task => {
        renderTask(task, list);   // ← これだけでOK
    });

    if (lastFocusedAddInputId) {
        const el = document.getElementById(lastFocusedAddInputId);
        if (el) {
            el.focus();
        }
    }
}

async function addTask(parentId, title) {
    return fetch(`${API_URL}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_id: parentId, title})
    }).then(res => res.json()).then(() => loadTasks());
}

async function updateTaskDone(id, done) {
    await fetch(`${API_URL}/tasks/${id}/done`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done })
    });
}

async function updateSubtaskDone(id, done) {
    await fetch(`${API_URL}/subtasks/${id}/done`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done })
    });
}

async function deleteTask(id) {
    await fetch(`${API_URL}/tasks/${id}`, {
        method: "DELETE"
    });
    loadTasks();
}

async function deleteSubtask(id) {
    await fetch(`${API_URL}/subtasks/${id}`, {
        method: "DELETE"
    });
    loadTasks();
}

function startEditTask(task) {
    const newTitle = prompt("新しいタスク名を入力", task.title);
    if (newTitle === null || newTitle.trim() === "") {
        return;
    }

    updateTaskTitle(task.id, newTitle);
}

loadTasks();

function renderTask(task, container) {
    const li = document.createElement("li");
    li.dataset.id = task.id;

    // 子タスク追加用のli (ulの下にはliのみにする)
    const addLi = document.createElement("li");
    addLi.classList.add("add-subtask");

    // 子タスク追加
    const addInput = document.createElement("input");
    addInput.id = "addNewTask" + task.id;
    addInput.placeholder = "子タスク追加";
    // フォーカスが当たったときにその入力欄の番号を覚えておく
    addInput.onfocus = () => {
        lastFocusedAddInputId = addInput.id;
    } 
    // Enterで追加処理実行、Escで解除
    addInput.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
            const title = addInput.value.trim();
            if(!title){
                return;
            }
            await addTask(task.id, title);
            addInput.value = "";
            addInput.focus();
        }
    });

    const addBtn = document.createElement("button");
    addBtn.textContent = "+";
    addBtn.onclick = async () => {
        const title = addInput.value.trim();
        if(!title){
            return;
        }
        await addTask(task.id, title);
        addInput.value = "";
        addInput.focus();
    }

    addLi.appendChild(addInput);
    addLi.appendChild(addBtn);

    if (taskFoldState[task.id] === undefined) {
        taskFoldState[task.id] = true;
    }
    // チェックボックス
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.onchange = () => {
        updateTaskDone(task.id, checkbox.checked);
    }

    // タイトル
    const title = document.createElement("span");
    title.textContent = task.title;
    title.style.cursor = "pointer";
    title.ondblclick = () => {
        startInlineEdit(title, task);
    };

    // 折り畳みボタン
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "▶";
    toggleBtn.classList.add("toggle-btn");

    const subList = document.createElement("ul");
    subList.style.marginLeft = "20px";
    subList.dataset.parentId = task.id;

    new Sortable(subList, {
        animation: 150,
        ghostClass: "sortable-ghost",
        draggable: "li",
        onEnd: (evt) => {
            const parent_ID = evt.to.dataset.parentId;
            const items = Array.from(evt.to.children);

            items.forEach((item, index) => {
                const id = item.dataset.id;
                if (!id){
                    return;
                }

                fetch(`${API_URL}/tasks/${id}/reorder`,{
                    method: "POST",
                    headers: { "Content-Type": "application/json"},
                    body: JSON.stringify({
                        position: index,
                        parent_id: parent_ID
                    })
                })
            })

        }
    });

    toggleBtn.onclick = () => {
        const willShow = subList.style.display === "none";
        subList.style.display = willShow ? "block" : "none";
        
        if (willShow){
            // 展開したときだけ追加欄は表示
            subList.prepend(addLi);
            toggleBtn.classList.add("open");
        } else {
            // 折りたたんだら追加欄は削除
            addLi.remove();
            toggleBtn.classList.remove("open");
        }

        taskFoldState[task.id] = willShow;
    };

    if (taskFoldState[task.id]) {
        subList.style.display = "block";
        subList.prepend(addLi);
        toggleBtn.classList.add("open");
    } else {
        subList.style.display = "none";
    }

    // 削除
    const delBtn = document.createElement("button");
    delBtn.textContent = "🗑";
    delBtn.onclick = () => {
        deleteTask(task.id);
    }

    li.appendChild(toggleBtn);
    li.appendChild(checkbox);
    li.appendChild(title);
    li.appendChild(delBtn);
    li.appendChild(subList);

    container.appendChild(li);

    // 子タスクを再帰的に描画
    task.children.forEach(child => renderTask(child, subList));
}

function startInlineEdit(titleElement, task) {
    const originalText = task.title;

    // input を作る
    const input = document.createElement("input");
    input.type = "text";
    input.value = originalText;
    input.style.width = "200px";

    // span を input に置き換える
    titleElement.replaceWith(input);
    input.focus();

    // ボタンが押されたときの処理
    input.addEventListener("keydown", (e) => {
        // Enter → 保存
        if (e.key === "Enter") {
            const newTitle = input.value.trim();
            if (newTitle !== "") {
                updateTaskTitle(task.id, newTitle);
            } else {
                // 空ならキャンセル扱い
                cancelInlineEdit(input, originalText);
            }
        }
        // Esc → キャンセル
        if (e.key === "Escape") {
            cancelInlineEdit(input, originalText);
        }
    });

    // フォーカス外れたらキャンセル（自然な挙動）
    input.addEventListener("blur", () => {
        cancelInlineEdit(input, originalText);
    });
}

function cancelInlineEdit(input, originalText) {
    const span = document.createElement("span");
    span.textContent = originalText;
    span.style.cursor = "pointer";

    // 再び編集できるように
    span.ondblclick = () => {
        startInlineEdit(span, { id: null, title: originalText });
    }

    input.replaceWith(span);
}

async function updateTaskTitle(id, title) {
    await fetch(`${API_URL}/tasks/${id}/title`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
    });

    loadTasks();
}