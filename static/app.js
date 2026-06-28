const API_URL = "http://127.0.0.1:5000";
let lastFocusedAddInputId = null;

document.getElementById("rootTaskAddBtn").onclick = () => {
    const input = document.getElementById("rootTaskInput");
    const title = rootInput.value.trim();
    if(!title){
        return;
    }
    addTask(null, input.value);
    input.value = "";
    input.focus();
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
        rootInput.focus();
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
        renderTask(task, null, list);
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
    loadTasks();
}

async function deleteTask(id) {
    await fetch(`${API_URL}/tasks/${id}`, {
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

function renderTask(task, parentColor = null, container) {
    // 色
    const color = task.color !== null && task.color !== "" 
        ? task.color 
        : parentColor || "transparent";
    
    // 親タスク/サブタスク共通ののli
    const li = document.createElement("li");
    li.dataset.id = task.id;
    li.classList.add("drag-handle");
    li.classList.add("task");
    li.style.backgroundColor = task.done
        ? `color-mix(in srgb, ${color} 60%, gray)`
        : color;

    // ヘッダ
    const taskHeader = document.createElement("div");
    taskHeader.classList.add("task-header");

    const headerLeft = document.createElement("div");
    headerLeft.classList.add("task-header-left");

    // 折り畳みボタン
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "▶";
    toggleBtn.classList.add("toggle-btn");

    // チェックボックス
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.onchange = () => {
        updateTaskDone(task.id, checkbox.checked);
    }
    checkbox.onclick = async () => {
        const done = checkbox.checked;
        if (done) {
            // 親 → 子孫全部チェック
            await fetch("/toggle_done_recursive", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: task.id, done: true })
            });
        } else {
            // 子 → 先祖全部チェック解除
            await fetch("/unset_done_ancestors", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: task.id })
            });
        }
        await loadTasks();
    }

    // タイトル
    const title = document.createElement("span");
    title.textContent = task.title;
    title.style.cursor = "pointer";
    title.ondblclick = () => {
        startInlineEdit(title, task);
    };

    // 削除ボタン
    const delBtn = document.createElement("button");
    delBtn.classList.add("delete-btn");
    delBtn.textContent = "🗑";
    delBtn.onclick = () => {
        deleteTask(task.id);
    }

    // メモボタン
    const memoBtn = document.createElement("button");
    memoBtn.textContent = "📝";
    memoBtn.classList.add("memo-btn");

    // カラーボタン
    const colorBtn = document.createElement("button");
    colorBtn.textContent = "◼︎";
    colorBtn.classList.add("color-btn");

    headerLeft.appendChild(toggleBtn);
    headerLeft.appendChild(checkbox);
    headerLeft.appendChild(title);
    headerLeft.appendChild(delBtn);
    headerLeft.appendChild(memoBtn);
    headerLeft.appendChild(colorBtn);

    // 追加欄
    const addArea = document.createElement("div");
    addArea.classList.add("add-area");

    // 子タスク追加入力欄
    const addInput = document.createElement("input");
    addInput.id = "addNewTask" + task.id;
    addInput.placeholder = "子タスク追加";

    // 子タスク追加ボタン
    const addBtn = document.createElement("button");
    addBtn.textContent = "+";
    addBtn.onclick = async () => {
        addChildTask();
    }

    addArea.appendChild(addInput);
    addArea.appendChild(addBtn);

    taskHeader.appendChild(headerLeft);
    taskHeader.appendChild(addArea);

    taskHeader.style.backgroundColor = task.done
        ? `color-mix(in srgb, ${color} 60%, gray)`
        : color;

    // subList
    const subList = document.createElement("ul");
    subList.classList.add("subList");
    subList.dataset.parentId = task.id;

    // サブタスクの順番移動
    new Sortable(subList, {
        animation: 150,
        handle: ".drag-handle",
        ghostClass: "sortable-ghost",
        draggable: "li",
        onEnd: (evt) => {
            const parent_ID = evt.to.dataset.parentId;
            const items = Array.from(evt.to.children);

            items.forEach((item, index) => {
                const id = item.dataset.id;
                if (!id) {
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

    // 折り畳み
    toggleBtn.onclick = async () => {
        const willShow = subList.style.display === "none";
        subList.style.display = willShow ? "block" : "none";
        
        if (willShow){
            // 展開したときだけ追加欄は表示
            toggleBtn.classList.add("open");
        } else {
            // 折りたたんだら追加欄は削除
            toggleBtn.classList.remove("open");
        }

        // 折り畳み状態の変数とその更新処理
        const isFolded = subList.style.display === "none" ? true : false;
        await fetch("/update_fold_state", {
            method: "POST",
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify({ id: task.id, folded: isFolded})
        });

        if (isFolded === true) {
            subList.style.display = "none";
        } else {
            subList.style.display = "block";
        }
        await loadTasks();
    };

    // フォーカスが当たったときにその入力欄の番号を覚えておく
    addInput.onfocus = () => {
        lastFocusedAddInputId = addInput.id;
    }

    // Enterで追加処理実行、Escで解除
    addInput.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
            addChildTask();
        }
    });

    // メモボタンを押したときの処理
    memoBtn.onclick = () => {
        const modal = document.getElementById("memoModal");
        const textarea = document.getElementById("memoTextarea");
        const title = document.getElementById("memoTitle");

        // タイトル表示
        title.textContent = task.title;

        // 既存メモを読み込み
        textarea.value = task.notes || "";

        // モーダル表示
        modal.style.display = "flex";

        // 保存ボタン
        document.getElementById("memoSaveBtn").onclick = async () => {
            await updateTaskMemo(task.id, { notes: textarea.value });
            loadTasks();
            modal.style.display = "none";
        };

        // 閉じるボタン
        document.getElementById("memoCloseBtn").onclick = () => {
            modal.style.display = "none";
        };

        // メモ欄更新関数
        async function updateTaskMemo(id, notes) {
            await fetch(`${API_URL}/tasks/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json"},
                body: JSON.stringify({ notes: textarea.value })
            });
        }
    };

    // カラーパレットの処理
    colorBtn.onclick = (e) => {
        const picker =document.getElementById("colorPicker");
        picker.style.display = "flex";
        picker.style.left = e.target.getBoundingClientRect().left + "px";
        picker.style.top = e.target.getBoundingClientRect().bottom + "px";

        // 編集しているタスクを覚える
        picker.dataset.targetId = task.id;

        // 現在の色を RGB 欄に反映
        const hex = task.color; // null or "" の場合もある

        if (hex && hex.startsWith("#") && hex.length === 7) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);

            document.getElementById("rInput").value = r;
            document.getElementById("gInput").value = g;
            document.getElementById("bInput").value = b;
            document.getElementById("colorPreview").style.backgroundColor = hex;
        } else {
            // 色が無い場合は空欄
            document.getElementById("rInput").value = "";
            document.getElementById("gInput").value = "";
            document.getElementById("bInput").value = "";
            document.getElementById("colorPreview").style.backgroundColor = "transparent";
        }
    };

    function getTaskColor(task, parentColor) {
        return task.color || parentColor || "transparent";
    }

    li.appendChild(taskHeader);
    li.appendChild(subList);

    container.appendChild(li);

    // 子タスクを再帰的に描画
    task.children.forEach(child => renderTask(child, color, subList));

    if (task.folded) {
        subList.style.display = "none";
        toggleBtn.classList.remove("open");
    } else {
        subList.style.display = "block";
        toggleBtn.classList.add("open");
    }

    // タスク追加処理を共通関数化
    async function addChildTask() {
        const title = addInput.value.trim();
        if (!title) {
            return;
        }
        // タスクを追加し再描画
        await addTask(task.id, title);
        addInput.value = "";
        addInput.focus();
    }
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

async function updateTaskColor(id, colorCode) {
    await fetch(`${API_URL}/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: colorCode })
    });
}

function rgbToHex(r, g, b) {
    const toHex = (n) => {
        return n.toString(16).padStart(2, "0");
    }
    console.log(toHex(r));
    console.log(toHex(g));
    console.log(toHex(b));
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

loadTasks();

document.addEventListener("DOMContentLoaded", () => {
    // カラーパレットからの選択
    document.querySelectorAll("#colorPicker div[data-color]").forEach(div => {
        div.onclick = async () => {
            const picker = document.getElementById("colorPicker");
            const id = picker.dataset.targetId;
            await updateTaskColor(id, div.dataset.color);
            await loadTasks();
            picker.style.display = "none";
        };
    });

    // 色のキャンセル
    document.querySelector(".color-clear").onclick = async () => {
        const picker = document.getElementById("colorPicker");
        const id = picker.dataset.targetId;
        await updateTaskColor(id, "");
        await loadTasks();
        picker.style.display = "none";
    }

    // カラーパレットを閉じる処理
    document.addEventListener("click", (ev) => {
        const picker = document.getElementById("colorPicker");
        if (picker.style.display === "flex" &&
            !picker.contains(ev.target) &&
            !ev.target.classList.contains("color-btn")) {
            picker.style.display = "none";
        }
    });

    // 色の選択
    ["rInput", "gInput", "bInput"].forEach(id => {
        document.getElementById(id).onkeydown = async (e) => {
            if (e.key === "Enter") {
                const r = parseInt(document.getElementById("rInput").value || "0");
                const g = parseInt(document.getElementById("gInput").value || "0");
                const b = parseInt(document.getElementById("bInput").value || "0");

                // 入力チェック
                if ([r, g, b].some(v => isNaN(v) || v < 0 || v > 255)) {
                    alert("Enter between 0 to 255");
                    return;
                }

                const colorCode = rgbToHex(r, g, b);

                console.log(colorCode);

                const picker = document.getElementById("colorPicker");
                const id = picker.dataset.targetId;

                await updateTaskColor(id, colorCode);
                await loadTasks();
                picker.style.display = "none";
            }
        };
    });

    // プレビューの表示更新
    ["rInput", "gInput", "bInput"].forEach(id => {
        document.getElementById(id).addEventListener("input", () => {
            const r = parseInt(document.getElementById("rInput").value || "0");
            const g = parseInt(document.getElementById("gInput").value || "0");
            const b = parseInt(document.getElementById("bInput").value || "0");

            // 範囲外はプレビュー更新しない
            if ([r, g, b].some(v => isNaN(v) || v < 0 || v > 255)) {
            document.getElementById("colorPreview").style.backgroundColor = "transparent";
            return;
            }

            const hex = rgbToHex(r, g, b);
            document.getElementById("colorPreview").style.backgroundColor = hex;
        });
    });

});
