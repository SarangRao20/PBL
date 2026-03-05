// Configure Marked.js options
marked.setOptions({
    gfm: true,
    breaks: true
});

document.addEventListener("DOMContentLoaded", () => {
    // Initial setup
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

    const activeTab = document.getElementById(tabName + 'Tab');
    if (activeTab) {
        activeTab.style.display = 'block';
        activeTab.classList.add('active');
    }

    // Find the button that was clicked or matching button
    const btn = document.querySelector(`button[onclick*="switchTab('${tabName}')"]`);
    if (btn) btn.classList.add('active');

    if (tabName === 'knowledge') {
        loadKnowledgeBase();
    } else if (tabName === 'analytics') {
        loadAnalytics();
    }
}

// Role management is now handled via /login and /logout backend sessions.

async function pollJob(jobId, inputEl) {
    const statusMsg = document.getElementById('scrapeStatus');
    const progContainer = document.getElementById('progressContainer');
    const progBar = document.getElementById('progressBar');

    progContainer.style.display = 'block';

    const interval = setInterval(async () => {
        try {
            const res = await fetch(`/api/job/${jobId}`);
            const data = await res.json();

            if (data.error) {
                clearInterval(interval);
                statusMsg.innerText = "Error tracking job.";
                progContainer.style.display = 'none';
                return;
            }

            progBar.style.width = `${data.progress}%`;
            statusMsg.innerText = data.message || `Processing... ${data.progress}%`;

            if (data.status === 'completed') {
                clearInterval(interval);
                statusMsg.style.color = "#73daca";
                setTimeout(() => { progContainer.style.display = 'none'; }, 2000);
                if (inputEl) inputEl.value = "";
                if (window.role === 'teacher' && document.getElementById('knowledgeTab').classList.contains('active')) {
                    loadKnowledgeBase();
                }
            } else if (data.status === 'failed') {
                clearInterval(interval);
                statusMsg.style.color = "#f85149";
                progContainer.style.display = 'none';
            }
        } catch (e) {
            console.error(e);
        }
    }, 1000);
}

async function scrapeUrl() {
    const urlInput = document.getElementById('scrapeUrl');
    const statusMsg = document.getElementById('scrapeStatus');

    if (!urlInput.value) return;

    statusMsg.innerText = "Initializing ingestion...";
    statusMsg.style.color = "#e3b341";

    try {
        const res = await fetch('/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: urlInput.value })
        });
        const data = await res.json();

        if (data.success && data.job_id) {
            pollJob(data.job_id, urlInput);
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

    statusMsg.innerText = "Initializing upload...";
    statusMsg.style.color = "#e3b341";

    try {
        const res = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success && data.job_id) {
            pollJob(data.job_id, fileInput);
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
            appendMessage('assistant', "System Error: " + data.error);
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

    // Render Markdown
    bubble.innerHTML = marked.parse(text);

    // If assistant, handle sources and mermaid
    if (role === 'assistant') {
        // Render Mermaid Diagrams
        const mermaidDivs = bubble.querySelectorAll('.language-mermaid');
        mermaidDivs.forEach((div, index) => {
            const chartConfig = div.textContent;
            const containerId = `mermaid-${Date.now()}-${index}`;
            const container = document.createElement('div');
            container.id = containerId;
            container.className = 'mermaid-container';
            container.style.marginTop = '1rem';
            div.parentNode.replaceChild(container, div);

            mermaid.render(containerId + '-svg', chartConfig).then(({ svg }) => {
                container.innerHTML = svg;
            });
        });

        if (sources && sources.length > 0) {
            const sourceInfo = document.createElement('div');
            sourceInfo.className = 'research-insights';

            let sourceHtml = `
                <details class="citation-details">
                    <summary class="citation-summary">
                        <i data-lucide="microscope" style="width:12px; height:12px;"></i>
                        Researcher Insights (${sources.length} sources)
                    </summary>
                    <div class="citation-content">
            `;

            sources.forEach((src, idx) => {
                const score = (src.score * 100).toFixed(1);
                sourceHtml += `
                    <div class="source-item">
                        <div class="source-header">
                            <span class="source-name">Source [${idx + 1}]: ${src.doc_type || 'General'}</span>
                            <span class="source-score">Match: ${score}%</span>
                        </div>
                        <p class="source-text">"${src.text.substring(0, 150)}..."</p>
                        ${window.role === 'teacher' ? `<button onclick="reIngestSource('${src.url}')" class="action-btn" style="margin-top:0.5rem; font-size:0.6rem;">Permanent Index</button>` : ''}
                    </div>
                `;
            });

            sourceHtml += `</div></details>`;
            sourceInfo.innerHTML = sourceHtml;
            bubble.appendChild(sourceInfo);
            lucide.createIcons();
        }

        // Self-Correcting Loop (Teacher Only)
        if (msgId && text !== '...' && document.body.getAttribute('data-role') === 'teacher') {
            const controls = document.createElement('div');
            controls.className = "feedback-controls";
            controls.innerHTML = `
                <button class="action-btn" onclick="toggleCorrection(${msgId})">
                    <i data-lucide="edit-3" style="width:12px;height:12px;"></i> Refine Answer
                </button>
                <textarea id="correction-${msgId}" class="correction-input" placeholder="Provide expert correction or enhancement..."></textarea>
                <button id="submit-${msgId}" class="action-btn" style="display:none; margin-top:0.5rem; color:var(--text-primary); border-color:var(--accent-primary);" onclick="submitCorrection(${msgId})">
                    Submit Refinement
                </button>
            `;
            bubble.appendChild(controls);
            lucide.createIcons();
        }

    } else {
        bubble.innerText = text;
    }

    msgDiv.appendChild(bubble);
    history.appendChild(msgDiv);
    history.scrollTop = history.scrollHeight;
}

function toggleCorrection(msgId) {
    const input = document.getElementById(`correction-${msgId}`);
    const submitBtn = document.getElementById(`submit-${msgId}`);
    const isVisible = input.style.display === 'block';

    input.style.display = isVisible ? 'none' : 'block';
    submitBtn.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) input.focus();
}

async function submitCorrection(msgId) {
    const input = document.getElementById(`correction-${msgId}`);
    const text = input.value.trim();
    if (!text) return;

    const container = input.parentElement;
    container.innerHTML = "<span style='font-size:0.75rem; color:var(--accent-primary);'>Refinement submitted. Healing knowledge base...</span>";

    await fetch('/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: msgId, type: -1, correction_text: text, context: "self_correcting_loop" })
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

    // Group chunks by doc_type (source)
    const groupedChunks = {};
    data.chunks.forEach(chunk => {
        if (!groupedChunks[chunk.doc_type]) {
            groupedChunks[chunk.doc_type] = [];
        }
        groupedChunks[chunk.doc_type].push(chunk);
    });

    // Render grouped chunks
    for (const [source, chunks] of Object.entries(groupedChunks)) {
        // Add a section header for the source
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = `
            <td colspan="4" style="background:var(--bg-secondary); border-top: 2px solid var(--border-color); padding: 1rem;">
                <div style="display:flex; align-items:center; gap:0.5rem; color:var(--text-primary); font-weight:600; font-size:0.85rem;">
                    <i data-lucide="folder" style="width:16px; height:16px; color:var(--accent-primary);"></i>
                    ${source} <span style="color:var(--text-secondary); font-weight:400; font-size:0.75rem;">(${chunks.length} chunks)</span>
                </div>
            </td>
        `;
        tbody.appendChild(headerRow);

        // Add chunk rows
        chunks.forEach(chunk => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td></td>
                <td>${chunk.author}</td>
                <td style="width: 50%;">
                    <div id="text-${chunk.id}" style="color:var(--text-secondary); font-size:0.85rem;">${chunk.text_chunk}</div>
                    <textarea id="edit-${chunk.id}" class="kb-edit-input" style="display:none; width: 100%; height: 100px; padding: 0.5rem; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px;">${chunk.text_chunk}</textarea>
                </td>
                <td style="text-align: right;">
                    <button class="action-btn" onclick="toggleEdit('${chunk.id}')" id="btn-edit-${chunk.id}"><i data-lucide="edit-2" style="width:14px;height:14px;"></i></button>
                    <button class="action-btn" onclick="saveChunk('${chunk.id}')" id="btn-save-${chunk.id}" style="display:none; color:white; border-color:var(--accent-primary);"><i data-lucide="check" style="width:14px;height:14px;"></i></button>
                    <button class="action-btn" onclick="deleteChunk('${chunk.id}')" style="color:#f85149;"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Re-initialize icons for newly added elements
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
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

async function loadAnalytics() {
    const container = document.getElementById('analyticsTab');

    // Inject Chart.js if not present
    if (!window.Chart) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        document.head.appendChild(script);
        await new Promise(r => script.onload = r);
    }

    const res = await fetch('/api/analytics');
    const data = await res.json();

    const tableContainer = container.querySelector('.table-container');
    tableContainer.innerHTML = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 2rem; width:100%;">
            <div class="bubble" style="background:var(--bg-secondary); border:1px solid var(--border-color); padding:1.5rem;">
                <h4 style="margin-bottom:1rem; font-size:0.8rem; color:var(--text-secondary); text-transform:uppercase;">Knowledge Distribution</h4>
                <canvas id="kbChart" style="max-height:300px;"></canvas>
            </div>
            <div class="bubble" style="background:var(--bg-secondary); border:1px solid var(--border-color); padding:1.5rem;">
                <h4 style="margin-bottom:1rem; font-size:0.8rem; color:var(--text-secondary); text-transform:uppercase;">Research Activity (7d)</h4>
                <canvas id="activityChart" style="max-height:300px;"></canvas>
            </div>
        </div>
    `;

    // Give DOM time to mount canvas
    requestAnimationFrame(() => {
        const ctx1 = document.getElementById('kbChart').getContext('2d');
        new Chart(ctx1, {
            type: 'doughnut',
            data: {
                labels: Object.keys(data.kb_composition),
                datasets: [{
                    data: Object.values(data.kb_composition),
                    backgroundColor: ['#444', '#666', '#888', '#AAA', '#CCC'],
                    borderColor: '#121212',
                    borderWidth: 2
                }]
            },
            options: {
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#A0A0A0', font: { family: 'Inter', size: 10 } }
                    }
                }
            }
        });

        const ctx2 = document.getElementById('activityChart').getContext('2d');
        new Chart(ctx2, {
            type: 'line',
            data: {
                labels: Object.keys(data.activity),
                datasets: [{
                    label: 'Queries',
                    data: Object.values(data.activity),
                    borderColor: '#8E8E8E',
                    backgroundColor: 'rgba(142, 142, 142, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                scales: {
                    y: {
                        ticks: { color: '#666', font: { size: 10 } },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    x: {
                        ticks: { color: '#666', font: { size: 10 } },
                        grid: { display: false }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
    });
}

async function reIngestSource(url) {
    if (!url || url === 'undefined') {
        alert("Source URL not available for re-ingestion.");
        return;
    }

    const status = document.getElementById('scrapeStatus');
    status.innerText = "Initializing re-ingestion...";
    status.className = "status-msg";
    status.style.color = "#e3b341";

    try {
        const res = await fetch('/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        });
        const data = await res.json();

        if (data.success && data.job_id) {
            pollJob(data.job_id, null);
        } else {
            status.innerText = "Failed: " + data.error;
            status.className = "status-msg error";
        }
    } catch (e) {
        status.innerText = "Error: " + e;
        status.className = "status-msg error";
    }
}
