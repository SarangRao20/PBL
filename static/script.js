// Configure Marked.js options
marked.setOptions({
    gfm: true,
    breaks: true
});

document.addEventListener("DOMContentLoaded", () => {
    // Initial setup if needed
    const role = document.body.getAttribute('data-role');
    document.getElementById('roleSelect').value = role;
});

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

    document.getElementById(tabName + 'Tab').classList.add('active');
    event.target.classList.add('active');

    if (tabName === 'knowledge') {
        loadKnowledgeBase();
    }
}

async function changeRole() {
    const role = document.getElementById('roleSelect').value;
    const author = role === 'teacher' ? 'Professor' : 'Guest Student';

    await fetch('/set_role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, author })
    });

    document.body.setAttribute('data-role', role);

    // Switch to chat tab if moving from teacher -> student
    if (role === 'student' && document.getElementById('knowledgeTab').classList.contains('active')) {
        switchTab('chat');
        document.querySelector('.nav-btn').classList.add('active'); // select Chat
    }
}

async function scrapeUrl() {
    const urlInput = document.getElementById('scrapeUrl');
    const statusMsg = document.getElementById('scrapeStatus');

    if (!urlInput.value) return;

    statusMsg.innerText = "Scraping... please wait.";
    statusMsg.style.color = "#e3b341";

    try {
        const res = await fetch('/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: urlInput.value })
        });
        const data = await res.json();

        if (data.success) {
            statusMsg.innerText = "Successfully added to context!";
            statusMsg.style.color = "#73daca";
            urlInput.value = "";
        } else {
            statusMsg.innerText = "Error: " + data.error;
            statusMsg.style.color = "#f85149";
        }
    } catch (e) {
        statusMsg.innerText = "Failed to reach server.";
        statusMsg.style.color = "#f85149";
    }
}

async function uploadDocument() {
    const fileInput = document.getElementById('uploadDoc');
    const statusMsg = document.getElementById('scrapeStatus');

    if (!fileInput.files.length) return;

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append("document", file);

    statusMsg.innerText = "Extracting & Embedding Document... please wait.";
    statusMsg.style.color = "#e3b341";

    try {
        const res = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            statusMsg.innerText = data.message;
            statusMsg.style.color = "#73daca";
            fileInput.value = ""; // clear input
        } else {
            statusMsg.innerText = "Error: " + data.error;
            statusMsg.style.color = "#f85149";
        }
    } catch (e) {
        statusMsg.innerText = "Failed to upload document.";
        statusMsg.style.color = "#f85149";
    }
}

function handleKeyPress(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;

    appendMessage('user', msg);
    input.value = "";

    // Typing indicator
    const typingId = "typing-" + Date.now();
    appendMessage('assistant', '...', typingId);

    try {
        const res = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: msg })
        });
        const data = await res.json();

        document.getElementById(typingId).remove();

        if (data.error) {
            appendMessage('assistant', "Error: " + data.error);
        } else {
            appendMessage('assistant', data.answer, null, data.sources, data.message_id);
        }
    } catch (e) {
        document.getElementById(typingId).remove();
        appendMessage('assistant', "Network Error.");
    }
}

function appendMessage(role, text, idOverride = null, sources = [], msgId = null) {
    const history = document.getElementById('chatHistory');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    if (idOverride) msgDiv.id = idOverride;

    const bubble = document.createElement('div');
    bubble.className = "bubble";

    // Render markdown for assistant, text for user
    if (role === 'assistant') {
        bubble.innerHTML = marked.parse(text);

        if (sources.length > 0) {
            const srcBox = document.createElement('div');
            srcBox.className = "sources-box";
            srcBox.innerHTML = "<strong>Sources:</strong><br>";
            sources.forEach((s, i) => {
                srcBox.innerHTML += `[Source ${i + 1}] Relatedness: ${s.score}%<br>`;
            });
            bubble.appendChild(srcBox);
        }

        // RLHF Loop
        if (msgId && text !== '...') {
            const rlhf = document.createElement('div');
            rlhf.className = "rlhf-container";
            rlhf.innerHTML = `
                <button class="rlhf-btn" onclick="submitFeedback(${msgId}, 1, this)">👍</button>
                <button class="rlhf-btn" onclick="toggleRLHFInput(this)">👎 Fix</button>
                <input type="text" class="rlhf-input" placeholder="What went wrong (negative constraint)?" onkeypress="if(event.key==='Enter') submitFeedback(${msgId}, -1, this)">
            `;
            bubble.appendChild(rlhf);
        }

    } else {
        bubble.innerText = text;
    }

    msgDiv.appendChild(bubble);
    history.appendChild(msgDiv);
    history.scrollTop = history.scrollHeight;
}

function toggleRLHFInput(btn) {
    const input = btn.nextElementSibling;
    input.style.display = input.style.display === 'block' ? 'none' : 'block';
    if (input.style.display === 'block') input.focus();
}

async function submitFeedback(msgId, type, el) {
    let text = "";
    const container = el.parentElement;

    if (type === -1) {
        text = el.value.trim();
        if (!text) return;
    }

    container.innerHTML = "<span style='font-size:12px;color:#73daca;'>Feedback saved.</span>";

    await fetch('/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: msgId, type: type, correction_text: text })
    });
}

// ========================
// TEACHER DASHBOARD
// ========================

async function loadKnowledgeBase() {
    const tbody = document.getElementById('kbBody');
    tbody.innerHTML = "<tr><td colspan='4'>Loading...</td></tr>";

    const res = await fetch('/api/knowledge_base');
    const data = await res.json();

    if (data.error) {
        tbody.innerHTML = `<tr><td colspan='4'>Error: ${data.error}</td></tr>`;
        return;
    }

    tbody.innerHTML = "";
    data.chunks.forEach(chunk => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="badge ${chunk.role}">${chunk.doc_type}</span></td>
            <td>${chunk.author}</td>
            <td style="width: 50%;">
                <div id="text-${chunk.id}">${chunk.text_chunk}</div>
                <textarea id="edit-${chunk.id}" class="kb-edit-input" style="display:none;">${chunk.text_chunk}</textarea>
            </td>
            <td>
                <button class="action-btn btn-save" onclick="toggleEdit('${chunk.id}')" id="btn-edit-${chunk.id}">✏️</button>
                <button class="action-btn btn-save" onclick="saveChunk('${chunk.id}')" id="btn-save-${chunk.id}" style="display:none;">💾</button>
                <button class="action-btn btn-del" onclick="deleteChunk('${chunk.id}')">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function toggleEdit(id) {
    const textDiv = document.getElementById(`text-${id}`);
    const editArea = document.getElementById(`edit-${id}`);
    const editBtn = document.getElementById(`btn-edit-${id}`);
    const saveBtn = document.getElementById(`btn-save-${id}`);

    textDiv.style.display = 'none';
    editArea.style.display = 'block';
    editBtn.style.display = 'none';
    saveBtn.style.display = 'inline-block';
}

async function saveChunk(id) {
    const newText = document.getElementById(`edit-${id}`).value;

    await fetch(`/api/knowledge_base/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text_chunk: newText })
    });

    loadKnowledgeBase(); // Reload to show embedded update
}

async function deleteChunk(id) {
    if (!confirm("Delete this chunk from the knowledge base?")) return;

    await fetch(`/api/knowledge_base/${id}`, {
        method: 'DELETE'
    });

    loadKnowledgeBase();
}
