const profile = {
  name: "示例候选人",
  phone: "13800000000",
  email: "candidate@example.com",
  politics: "示例政治面貌",
  hometown: "地区A",
  english: "英语能力示例",
  education: "示例大学A计算机科学硕士 YYYY-MM ~ YYYY-MM；示例大学B示例专业本科 YYYY-MM ~ YYYY-MM",
  gpa: "GPA 示例",
  internships: ["示例公司", "示例公司", "示例公司"],
  skills: ["Java", "Python", "Redis", "RocketMQ", "MySQL", "深度学习", "NLP", "Transformer", "LLM", "MARL", "RAG", "AI Agent"],
};

const fallbackJobs = [
  { company: "DemoCorp", role: "IT与技术研发类", region: "地区A 地区B/地区B", score: 92, status: "待确认抓取", note: "官网证据完整，待人工确认入库" },
  { company: "DemoCorp", role: "数字化技术岗", region: "地区A 地区A", score: 88, status: "待确认字段", note: "专业目录需核对" },
  { company: "DemoCorp", role: "信息科技岗", region: "地区B/全国", score: 84, status: "待确认来源", note: "DemoCorp 试点源，待确认投递入口" },
  { company: "DemoCorp", role: "数据平台工程师", region: "地区A 地区B", score: 81, status: "待回溯官网", note: "公众号线索，待确认官网原文" },
  { company: "DemoCorp", role: "软件研发岗", region: "地区A 地区B", score: 79, status: "待补截止", note: "截止时间缺失" },
];

const pages = [
  { id: "overview", label: "总览", title: "总览", subtitle: "查看今日抓取确认结果和后续协作事项。" },
  { id: "search", label: "每日搜索", title: "每日搜索", subtitle: "自动捕获新开放岗位，但抓取结果必须人工确认后才可入库。" },
  { id: "jobs", label: "岗位库", title: "岗位库", subtitle: "只管理已确认或待确认的岗位，按匹配度和投递状态推进。" },
  { id: "auth", label: "注册登录协作", title: "注册登录协作", subtitle: "把需要人工参与的注册、登录、验证码、短信验证独立成前置模块。" },
  { id: "prefill", label: "简历预填", title: "简历预填", subtitle: "登录态就绪后自动填表；低置信字段与最终提交必须人工确认。" },
  { id: "tracking", label: "投递跟踪", title: "投递跟踪", subtitle: "记录已投岗位、当前进度、官网回查结果与下一步动作。" },
  { id: "settings", label: "资料设置", title: "资料设置", subtitle: "维护结构化个人资料、岗位偏好、来源策略与安全边界。" },
];

const state = {
  activePage: "overview",
  jobs: [...fallbackJobs],
  authSessions: [],
  prefillDrafts: [],
  events: [],
  selectedJob: fallbackJobs[0],
  selectedAuthSession: null,
  reviewChecks: {
    source_confirmed: false,
    fields_confirmed: false,
    deadline_confirmed: false,
    fit_confirmed: false,
  },
  backendOnline: false,
  busy: false,
  notice: "",
};

const API_BASE = "http://127.0.0.1:8000/api";

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `HTTP ${response.status}`);
  }
  return response.json();
}

function toViewJob(job) {
  return {
    id: job.id,
    company: job.company,
    role: job.job_name || job.role,
    region: job.location || job.region,
    score: job.fit_score || job.score || 0,
    status: statusLabel(job.status),
    rawStatus: job.status,
    note: job.review?.notes || statusNote(job.status),
    sourceUrl: job.source_url,
    fitReason: job.fit_reason || [],
    batch: job.batch,
    sourceType: job.source_type,
    firstSeenAt: job.first_seen_at,
    evidenceId: job.evidence_id,
  };
}

function statusLabel(status) {
  return {
    capture_waiting_review: "待确认抓取",
    needs_more_evidence: "待补充证据",
    rejected: "已退回",
    job_ready: "已确认入库",
    auth_waiting_for_user: "人工注册协作",
    auth_ready: "登录就绪",
    prefill_ready: "预填草稿就绪",
    submitted: "已提交",
    tracking: "跟踪中",
    closed: "已关闭",
  }[status] || status || "待确认";
}

function statusNote(status) {
  return {
    capture_waiting_review: "等待你确认来源、字段、截止时间和岗位适配",
    needs_more_evidence: "抓取信息未全部确认，需要补证据",
    job_ready: "已确认，可进入人工注册协作",
    auth_waiting_for_user: "等待你完成验证码、短信或协议确认",
    auth_ready: "注册登录已确认，可生成预填草稿",
    prefill_ready: "已生成预填草稿，等待低置信字段确认",
  }[status] || "来自后端状态";
}

function selectedBackendJob() {
  return state.jobs.find((job) => job.id && job.id === state.selectedJob?.id);
}

async function refreshBackendData() {
  try {
    const [jobs, authSessions, drafts, events] = await Promise.all([
      api("/jobs"),
      api("/auth-sessions"),
      api("/prefill/drafts"),
      api("/events"),
    ]);
    state.jobs = jobs.map(toViewJob);
    state.authSessions = authSessions;
    state.prefillDrafts = drafts;
    state.events = events;
    state.backendOnline = true;
    if (state.jobs.length) {
      const current = state.jobs.find((job) => job.id === state.selectedJob?.id);
      state.selectedJob = current || state.jobs[0];
    }
    state.selectedAuthSession = state.authSessions.find((session) => session.job_id === state.selectedJob?.id) || null;
  } catch (error) {
    state.backendOnline = false;
    state.notice = `后端未连接：${error.message}`;
  }
}

async function runAction(label, task) {
  state.busy = true;
  state.notice = `${label}中...`;
  renderShell();
  try {
    await task();
    await refreshBackendData();
    state.notice = `${label}完成`;
  } catch (error) {
    state.notice = `${label}失败：${error.message}`;
  } finally {
    state.busy = false;
    renderShell();
  }
}

async function runCapture() {
  await runAction("运行抓取", () => api("/capture/run", { method: "POST" }));
}

async function confirmSelectedJob() {
  const job = selectedBackendJob();
  if (!job?.id) throw new Error("当前岗位不是后端岗位");
  if (!allReviewChecksPassed()) throw new Error("请先完成四项人工确认");
  await runAction("确认入库", () =>
    api(`/capture/jobs/${job.id}/review`, {
      method: "POST",
      body: JSON.stringify({
        ...state.reviewChecks,
        notes: "前端人工确认通过",
      }),
    })
  );
}

async function createAuthForSelectedJob() {
  const job = selectedBackendJob();
  if (!job?.id) throw new Error("当前岗位不是后端岗位");
  await runAction("创建人工注册协作", () =>
    api("/auth-sessions", {
      method: "POST",
      body: JSON.stringify({ job_id: job.id }),
    })
  );
}

async function confirmSelectedAuth() {
  const session = state.selectedAuthSession;
  if (!session?.id) throw new Error("当前岗位没有注册协作任务");
  await runAction("确认注册完成", () =>
    api(`/auth-sessions/${session.id}/confirm`, {
      method: "POST",
      body: JSON.stringify({ confirmed_by_user: true }),
    })
  );
}

async function createPrefillForSelectedJob() {
  const job = selectedBackendJob();
  if (!job?.id) throw new Error("当前岗位不是后端岗位");
  await runAction("生成预填草稿", () => api(`/prefill/${job.id}/draft`, { method: "POST" }));
}

function allReviewChecksPassed() {
  return Object.values(state.reviewChecks).every(Boolean);
}

function resetReviewChecks() {
  state.reviewChecks = {
    source_confirmed: false,
    fields_confirmed: false,
    deadline_confirmed: false,
    fit_confirmed: false,
  };
}

function setNotice(message) {
  state.notice = message;
  renderShell();
}

function pill(text, color = "gray") {
  return `<span class="pill ${color}">${text}</span>`;
}

function button(text, variant = "secondary", attrs = "") {
  return `<button class="btn ${variant}" type="button" ${attrs} ${state.busy ? "disabled" : ""}>${text}</button>`;
}

function renderShell() {
  const page = pages.find((item) => item.id === state.activePage);
  document.querySelector("#app").innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-title">校园招聘秋招投递助手</div>
          <div class="brand-subtitle">MVP 工作台</div>
        </div>
        <nav class="nav" aria-label="主导航">
          ${pages.map((item) => `
            <button class="nav-item ${item.id === state.activePage ? "active" : ""}" type="button" data-page="${item.id}">
              <span class="nav-icon" aria-hidden="true"></span>
              <span>${item.label}</span>
            </button>
          `).join("")}
        </nav>
      </aside>
      <main class="main">
        <header class="topbar">
          <div>
            <h1 class="page-title">${page.title}</h1>
            <div class="page-subtitle">${page.subtitle}</div>
          </div>
          <div class="top-actions">${renderTopPills(page.id)}</div>
        </header>
        ${state.notice ? `<div class="notice ${state.backendOnline ? "ok" : "warn"}">${state.notice}</div>` : ""}
        <section class="content">${renderPage(page.id)}</section>
      </main>
    </div>
  `;

  document.querySelectorAll("[data-page]").forEach((node) => {
    node.addEventListener("click", () => {
      state.activePage = node.dataset.page;
      renderShell();
    });
  });
  bindActions();
}

function renderTopPills(pageId) {
  const waitingCount = state.jobs.filter((job) => job.rawStatus === "capture_waiting_review").length;
  const readyCount = state.jobs.filter((job) => job.rawStatus === "job_ready").length;
  const authCount = state.jobs.filter((job) => job.rawStatus === "auth_waiting_for_user").length;
  const map = {
    overview: [pill(`后端${state.backendOnline ? "已连接" : "未连接"}`, state.backendOnline ? "green" : "red"), pill(`抓取待确认 ${waitingCount}`, "amber")],
    search: [pill("每天 08:30 自动触发", "teal"), pill("抓取必须确认", "amber")],
    jobs: [pill(`已确认入库 ${readyCount}`, "teal"), pill(`抓取待确认 ${waitingCount}`, "amber")],
    auth: [pill(`人工注册协作 ${authCount}`, "amber"), pill("不绕过校验", "teal")],
    prefill: [pill("登录就绪", "green"), pill("最终确认", "amber")],
    tracking: [pill("已投递 5", "green"), pill("需回查 2", "amber")],
    settings: [pill("Markdown + JSON", "blue"), pill("本地优先", "teal")],
  };
  return map[pageId].join("");
}

function bindActions() {
  document.querySelectorAll("[data-action]").forEach((node) => {
    node.addEventListener("click", async () => {
      const action = node.dataset.action;
      if (action === "run-capture") await runCapture();
      if (action === "confirm-job") await confirmSelectedJob();
      if (action === "create-auth") await createAuthForSelectedJob();
      if (action === "confirm-auth") await confirmSelectedAuth();
      if (action === "create-prefill") await createPrefillForSelectedJob();
      if (action === "edit-sources") setNotice("来源配置当前可直接编辑输入框；持久化保存会接入后端 sources 配置接口");
      if (action === "save-draft") setNotice("保存为草稿已进入前端待接入状态：后续会接官网草稿保存 API");
      if (action === "request-confirm") setNotice("已记录确认请求：后续会弹出低置信字段确认面板");
      if (action === "save-settings") setNotice("设置保存接口待接入：当前先保留页面输入，不写入后端");
      if (action === "export-template") setNotice("导出模板待接入：后续会下载 profile.md / profile.json");
      if (action === "go-search") {
        state.activePage = "search";
        renderShell();
      }
      if (action === "go-jobs") {
        state.activePage = "jobs";
        renderShell();
      }
      if (action === "go-auth") {
        state.activePage = "auth";
        renderShell();
      }
      if (action === "go-prefill") {
        state.activePage = "prefill";
        renderShell();
      }
      if (action === "go-tracking") {
        state.activePage = "tracking";
        renderShell();
      }
    });
  });
  document.querySelectorAll("[data-review-check]").forEach((node) => {
    node.addEventListener("change", () => {
      state.reviewChecks[node.dataset.reviewCheck] = node.checked;
      renderShell();
    });
  });
  document.querySelectorAll("[data-job-id]").forEach((node) => {
    node.addEventListener("click", () => {
      const job = state.jobs.find((item) => item.id === node.dataset.jobId);
      if (job) {
        state.selectedJob = job;
        state.selectedAuthSession = state.authSessions.find((session) => session.job_id === job.id) || null;
        resetReviewChecks();
        renderShell();
      }
    });
  });
}

function renderPage(pageId) {
  return {
    overview: renderOverview,
    search: renderSearch,
    jobs: renderJobs,
    auth: renderAuth,
    prefill: renderPrefill,
    tracking: renderTracking,
    settings: renderSettings,
  }[pageId]();
}

function renderOverview() {
  const waitingCount = state.jobs.filter((job) => job.rawStatus === "capture_waiting_review").length;
  const readyCount = state.jobs.filter((job) => job.rawStatus === "job_ready").length;
  const authCount = state.jobs.filter((job) => job.rawStatus === "auth_waiting_for_user").length;
  const steps = [
    ["每日搜索", "收集新岗位", "done"],
    ["抓取确认", "确认来源和字段", "active"],
    ["岗位库", "确认后入库", ""],
    ["注册登录协作", "人工完成验证", "active"],
    ["简历预填", "自动填写草稿", ""],
    ["投递跟踪", "记录状态变化", ""],
  ];
  return `
    <div class="grid">
      <div class="kpis">
        ${renderKpi("7", "今日新增岗位", "teal")}
        ${renderKpi(String(waitingCount), "抓取待确认", "amber")}
        ${renderKpi("5", "已投递跟踪", "green")}
        ${renderKpi(String(authCount), "人工注册协作", "blue")}
      </div>
      <section class="card">
        <h2 class="section-title">产品链路</h2>
        <div class="pipeline">
          ${steps.map(([title, sub, tone]) => `<div class="pipe-step ${tone}"><div class="pipe-title">${title}</div><div class="pipe-state">${sub}</div></div>`).join("")}
        </div>
      </section>
      <div class="grid">
        <section class="card">
          <h2 class="section-title">今日待办</h2>
          ${renderActionQueue()}
        </section>
        <section class="card">
          <h2 class="section-title">今日确认结果</h2>
          ${renderMetricLine("后端岗位总数", String(state.jobs.length), "teal")}
          ${renderMetricLine("已确认入库", String(readyCount), "green")}
          ${renderMetricLine("待补充证据", "2", "amber")}
          ${renderMetricLine("退回抓取", "1", "red")}
          <div class="split-line"></div>
          <p class="muted">确认通过的岗位才会进入岗位库；待补充和退回的岗位不会进入注册登录协作。</p>
        </section>
      </div>
    </div>
  `;
}

function renderSearch() {
  const shownJobs = state.jobs.length ? state.jobs : fallbackJobs;
  return `
    <div class="grid">
      <div class="grid two">
        <section class="card">
          <div class="status-row"><h2 class="section-title">搜索策略</h2>${pill("按配置筛选", "teal")}</div>
          <div class="form-grid">
            <label class="control">
              <span>地区A</span>
              <input value="地区A、地区A、地区A、地区A、地区A" />
            </label>
            <label class="control">
              <span>岗位方向</span>
              <input value="后端、Java、数据、算法、AI、平台工程" />
            </label>
            <label class="control">
              <span>企业范围</span>
              <input value="按配置筛选；按配置过滤；外企后续白名单" />
            </label>
            <label class="control">
              <span>候选人画像</span>
              <textarea rows="4">计算机专业，2026 届，按配置优先校招官网投递。关注技术研发、数字化、数据平台、算法和 AI 相关岗位。</textarea>
            </label>
          </div>
        </section>
        <section class="card">
          <div class="status-row"><h2 class="section-title">来源配置</h2>${button("编辑来源", "secondary", 'data-action="edit-sources"')}</div>
          <div class="source-editor">
            ${renderSourceEditorRow("企业官网", "DemoCorp、DemoCorp、运营商、银行、城投、交控", "正常")}
            ${renderSourceEditorRow("微信公众号", "校园招聘/人才发展/集团官微", "需扩展")}
            ${renderSourceEditorRow("示例公司/搜索", "发现企业线索，不作为最终证据", "审阅中")}
          </div>
          <p class="muted">来源可以编辑；搜索不会自动放行结果，所有抓取结果仍进入确认队列。</p>
        </section>
      </div>
      <div class="grid">
        <section class="card">
          <div class="status-row">
            <h2 class="section-title">今日新岗位</h2>
            ${pill(`${shownJobs.length} 个岗位`, "teal")}
            ${pill("抓取后仍需确认", "amber")}
            ${button("运行本地抓取", "primary", 'data-action="run-capture"')}
          </div>
          <div class="list">${shownJobs.slice(0, 6).map(renderJobListRow).join("")}</div>
        </section>
      </div>
    </div>
  `;
}

function renderJobs() {
  const shownJobs = state.jobs.length ? state.jobs : fallbackJobs;
  const selected = state.selectedJob || shownJobs[0];
  const canConfirm = selected?.rawStatus === "capture_waiting_review" || selected?.rawStatus === "needs_more_evidence";
  const canCreateAuth = selected?.rawStatus === "job_ready";
  const canSubmitReview = canConfirm && allReviewChecksPassed();
  return `
    <div class="grid">
      <section class="card compact">
        <div class="status-row">
          <strong>筛选条件</strong>
          ${pill("地区A / 地区A / 地区A / 地区A / 地区A", "gray")}
          ${pill("后端 / Java / 数据 / 算法 / AI", "gray")}
          ${pill("待确认抓取 / 已确认入库 / 待注册 / 已投递", "gray")}
          ${pill("企业 / 企业 / 事业单位", "gray")}
        </div>
      </section>
      <div class="grid wide">
        <section class="card">
          <h2 class="section-title">岗位列表</h2>
          <table class="table">
            <thead><tr><th>公司</th><th>岗位</th><th>地区</th><th>匹配</th><th>状态</th></tr></thead>
            <tbody>${shownJobs.map((job) => renderJobTableRow(job, selected?.id === job.id)).join("")}</tbody>
          </table>
        </section>
        <aside class="grid">
          <section class="card compact">
            <h2 class="section-title">当前岗位</h2>
            <div class="detail-stack">
              <div><strong>${selected.company}</strong><div class="muted">${selected.role} · ${selected.status}</div></div>
              <div><div class="field-label">匹配原因</div>${selected.fitReason?.length ? selected.fitReason.join("；") : "Java/Python、分布式、AI Agent 与岗位技术方向高度相关"}</div>
              <div><div class="field-label">抓取确认</div>入库前需确认来源、岗位名称、地区、截止时间和适配方向</div>
              ${renderJobEvidence(selected)}
              ${canConfirm ? renderReviewChecklist() : ""}
              <div><div class="field-label">投递入口</div>确认后才允许进入官网注册/登录链路</div>
              <div><div class="field-label">风险提示</div>验证码、短信、最终提交均需人工确认</div>
              <div class="row-actions">
                ${canConfirm ? button("确认入库", "primary", `data-action="confirm-job" ${canSubmitReview ? "" : "disabled"}`) : ""}
                ${canCreateAuth ? button("创建注册协作", "primary", 'data-action="create-auth"') : ""}
                ${button("刷新岗位", "secondary", 'data-action="go-jobs"')}
              </div>
            </div>
          </section>
          <section class="card compact">
            <h2 class="section-title">状态分组</h2>
            ${renderMetricLine("待确认抓取", String(state.jobs.filter((job) => job.rawStatus === "capture_waiting_review").length), "amber")}
            ${renderMetricLine("已确认入库", String(state.jobs.filter((job) => job.rawStatus === "job_ready").length), "teal")}
            ${renderMetricLine("人工注册协作", String(state.jobs.filter((job) => job.rawStatus === "auth_waiting_for_user").length), "amber")}
            ${renderMetricLine("登录就绪", String(state.jobs.filter((job) => job.rawStatus === "auth_ready").length), "blue")}
          </section>
        </aside>
      </div>
    </div>
  `;
}

function renderAuth() {
  const selected = state.selectedJob || state.jobs[0] || fallbackJobs[0];
  const session = state.selectedAuthSession;
  const canCreateAuth = selected?.rawStatus === "job_ready";
  const canConfirmAuth = session?.status === "auth_waiting_for_user";
  const canCreatePrefill = selected?.rawStatus === "auth_ready";
  return `
    <div class="grid">
      <section class="card compact">
        <div class="status-row">
          <strong>当前任务</strong>
          <span>${selected.company} · ${selected.role}</span>
          ${pill(selected.status || "待选择", "blue")}
          ${session ? pill(statusLabel(session.status), session.status === "auth_ready" ? "green" : "amber") : pill("未创建协作", "gray")}
        </div>
      </section>
      <div class="grid two">
        <section class="card">
          <h2 class="section-title">页面识别</h2>
          <div class="browser-mock">
            <div class="browser-bar">https://campus.ct.../login</div>
            <div class="form-mock">
              <h3>登录 / 注册页面</h3>
              ${renderFormMockRow("手机号", profile.phone)}
              ${renderFormMockRow("邮箱", profile.email)}
              ${renderFormMockRow("姓名", profile.name)}
              <div class="question warn">验证码区域：由用户在官网页面输入</div>
            </div>
          </div>
          <p class="muted">系统只预填非敏感字段；验证码、短信、扫码、协议勾选都进入人工确认。</p>
          <div class="row-actions">
            ${canCreateAuth ? button("创建注册协作", "primary", 'data-action="create-auth"') : ""}
            ${canConfirmAuth ? button("我已完成人工验证", "primary", 'data-action="confirm-auth"') : ""}
            ${canCreatePrefill ? button("生成预填草稿", "primary", 'data-action="create-prefill"') : ""}
            ${button("返回岗位库", "secondary", 'data-action="go-jobs"')}
          </div>
        </section>
        <div class="grid">
          <section class="card">
            <h2 class="section-title">待你确认</h2>
            ${renderQuestion("验证码", "请在官网页面输入图片验证码", "当前阻塞", "warn")}
            ${renderQuestion("短信验证", "若触发短信验证码，由你输入", "待触发")}
            ${renderQuestion("注册协议", "系统可定位勾选框，但需你确认", "待确认")}
          </section>
          <section class="card">
            <h2 class="section-title">状态流转</h2>
            <div class="pipeline">
              ${["选岗位", "查登录", "等人工", "已登录", "查表单"].map((step, index) => `<div class="pipe-step ${index < 2 ? "done" : index === 2 ? "active" : ""}"><div class="pipe-title">${step}</div></div>`).join("")}
            </div>
            <p>只有 auth_ready = true 后，简历预填模块才会启动；否则继续停在人工协作队列。</p>
            <div class="question">检查点：登录态有效 / 账号可进入投递系统 / 无额外人工验证</div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function renderPrefill() {
  const selected = state.selectedJob || state.jobs[0] || fallbackJobs[0];
  const latestDraft = state.prefillDrafts.find((draft) => draft.job_id === selected?.id);
  const canCreatePrefill = selected?.rawStatus === "auth_ready";
  const fields = [
    ["姓名", profile.name, "高", "自动填入"],
    ["手机号", profile.phone, "高", "自动填入"],
    ["邮箱", profile.email, "高", "自动填入"],
    ["最高学历", "示例大学A 计算机科学硕士", "高", "自动填入"],
    ["政治面貌", profile.politics, "高", "自动填入"],
    ["专业类别", "计算机/电子信息/自动化？", "中", "需要确认"],
    ["实习经历摘要", profile.internships.join("、"), "中", "生成后确认"],
    ["获奖情况", "资料缺失", "低", "向你提问"],
  ];
  return `
    <div class="grid">
      <section class="card compact">
        <div class="status-row">
          <strong>预填进度</strong>
          ${pill("识别表单：完成", "green")}
          ${pill("字段映射：进行中", "blue")}
          ${pill("低置信提问：3 项", "amber")}
          ${pill("最终确认：等待", "gray")}
          ${canCreatePrefill ? button("生成预填草稿", "primary", 'data-action="create-prefill"') : ""}
        </div>
      </section>
      <div class="grid wide">
        <section class="card">
          <h2 class="section-title">字段映射表</h2>
          <table class="table">
            <thead><tr><th>官网字段</th><th>资料模板值</th><th>置信度</th><th>处理</th></tr></thead>
            <tbody>${(latestDraft ? latestDraft.fields.map((field) => [field.field, field.value ?? "待补充", confidenceLabel(field.confidence), actionLabel(field.action)]) : fields).map(renderFieldRow).join("")}</tbody>
          </table>
        </section>
        <aside class="grid">
          <section class="card compact">
            <h2 class="section-title">待确认问题</h2>
            ${(latestDraft?.questions?.length ? latestDraft.questions.map((q) => renderQuestion(q.title, q.reason, "", "warn")).join("") : `
              ${renderQuestion("专业类别", "该官网没有“示例专业”，是否选择“计算机类”？", "", "warn")}
              ${renderQuestion("自我评价", "是否使用面向校园招聘的克制版摘要？", "")}
              ${renderQuestion("获奖情况", "是否为空，还是补充竞赛/奖学金？", "")}
            `)}
          </section>
          <section class="card compact">
            <h2 class="section-title">最终提交保护</h2>
            <p>系统可以完成保存草稿、下一步、附件上传前检查，但不会点击最终提交。最终提交前弹出完整复核清单，由你手动确认。</p>
            <div class="question warn">阻塞策略：遇到验证码、短信、字段不匹配、最终提交按钮，立即暂停并弹窗。</div>
            <div class="row-actions">${button("保存为草稿", "primary", 'data-action="save-draft"')}${button("请求确认", "secondary", 'data-action="request-confirm"')}</div>
          </section>
        </aside>
      </div>
    </div>
  `;
}

function renderTracking() {
  const applications = [
    ["DemoCorp", "IT研发类", "08-09", "简历已接收", "等待筛选"],
    ["DemoCorp", "信息科技岗", "08-08", "待完善附件", "上传成绩单"],
    ["DemoCorp", "数字化技术岗", "08-07", "报名成功", "09-01回查"],
    ["DemoCorp", "数据平台岗", "08-06", "资格审查中", "自动回查"],
    ["DemoCorp", "软件研发岗", "08-05", "未提交", "补充字段"],
  ];
  return `
    <div class="grid">
      <section class="card">
        <h2 class="section-title">链路状态机</h2>
        <div class="pipeline">${["submitted", "tracking", "progress_found", "action_needed", "closed"].map((step, index) => `<div class="pipe-step ${index < 2 ? "done" : index === 3 ? "active" : ""}"><div class="pipe-title">${step}</div></div>`).join("")}</div>
      </section>
      <div class="grid wide">
        <section class="card">
          <h2 class="section-title">投递记录</h2>
          <table class="table">
            <thead><tr><th>公司</th><th>岗位</th><th>提交日</th><th>进度</th><th>下一步</th></tr></thead>
            <tbody>${applications.map((row, i) => `<tr class="${i === 1 ? "selected" : ""}"><td><strong>${row[0]}</strong></td><td>${row[1]}</td><td class="muted">${row[2]}</td><td>${pill(row[3], i === 1 ? "amber" : i === 4 ? "red" : "green")}</td><td>${row[4]}</td></tr>`).join("")}</tbody>
          </table>
        </section>
        <aside class="grid">
          <section class="card compact">
            <h2 class="section-title">官网进度回查</h2>
            ${renderMetricLine("回查频率", "每天 10:00 / 17:00")}
            ${renderMetricLine("识别方式", "登录后读取状态文本")}
            ${renderMetricLine("失败处理", "登录失效则回到注册登录协作")}
            ${renderMetricLine("保留证据", "截图 + DOM 摘要 + 时间戳")}
          </section>
          <section class="card compact">
            <h2 class="section-title">事件日志</h2>
            ${renderLog([["08-09 09:12", "电信地区A提交成功，进入 tracking"], ["08-09 10:00", "DemoCorp 发现附件缺失，进入 action_needed"], ["08-08 17:03", "DemoCorp状态：报名成功"], ["08-08 08:30", "自动回查 5 个岗位"]])}
          </section>
        </aside>
      </div>
    </div>
  `;
}

function renderSettings() {
  return `
    <div class="grid">
      <div class="grid two">
        <section class="card">
          <h2 class="section-title">个人资料</h2>
          <div class="profile-grid">
            ${renderProfileItem("姓名", profile.name)}
            ${renderProfileItem("手机", profile.phone)}
            ${renderProfileItem("邮箱", profile.email)}
            ${renderProfileItem("政治面貌", profile.politics)}
            ${renderProfileItem("籍贯", profile.hometown)}
            ${renderProfileItem("英语", profile.english)}
          </div>
          <div class="split-line"></div>
          <div class="muted">教育：${profile.education}</div>
        </section>
        <section class="card">
          <h2 class="section-title">求职偏好</h2>
          ${renderMetricLine("地区", "地区A、地区A、地区A、地区A、地区A")}
          ${renderMetricLine("岗位", "后端、Java、数据、算法、AI、平台工程")}
          ${renderMetricLine("企业", "默认按配置筛选；按配置过滤；外企后续白名单")}
          ${renderMetricLine("学历适配", "2026 届 / 港硕 / 本硕计算机相关")}
          <div class="tags">${pill("按配置过滤", "red")}${pill("保留官网证据", "teal")}</div>
        </section>
      </div>
      <div class="grid wide">
        <section class="card">
          <div class="status-row"><h2 class="section-title">结构化模板</h2>${pill("profile.md", "blue")}${pill("profile.json", "teal")}</div>
          <pre class="code-panel">${JSON.stringify({
            name: profile.name,
            education: ["HKU CS MSc", "BJTU IoT BSc"],
            gpa: profile.gpa,
            skills: profile.skills.slice(0, 8),
            internships: profile.internships,
            preferences: {
              company_type: "CONFIGURED_COMPANY_TYPE",
              regions: ["地区A", "地区A", "地区A", "地区A", "地区A"],
              exclude_private: true,
            },
          }, null, 2)}</pre>
        </section>
        <section class="card">
          <h2 class="section-title">系统设置</h2>
          ${renderMetricLine("每日搜索", "08:30 自动触发")}
          ${renderMetricLine("进度回查", "10:00 / 17:00")}
          ${renderMetricLine("人工弹窗", "验证码、短信、最终提交、低置信字段")}
          ${renderMetricLine("数据保存", "本地 Markdown/JSON + n8n 执行记录")}
          ${renderMetricLine("安全边界", "不绕过任何人工校验")}
          <div class="row-actions">${button("保存设置", "primary", 'data-action="save-settings"')}${button("导出模板", "secondary", 'data-action="export-template"')}</div>
        </section>
      </div>
    </div>
  `;
}

function renderKpi(number, label, color) {
  return `<section class="card kpi"><div class="kpi-number">${number}</div><div class="kpi-label">${label}</div><div style="margin-top:18px">${pill("今日", color)}</div></section>`;
}

function renderActionQueue() {
  return `
    <div class="list">
      <div class="list-row">
        <div>
          <div class="row-title">今日抓取结果确认</div>
          <div class="row-subtitle">7 条新岗位等待你确认来源、字段、截止时间后入库</div>
        </div>
        <span class="muted">每日搜索</span>
        ${pill("待确认抓取", "amber")}
        ${button("去确认", "primary", 'data-action="go-jobs"')}
      </div>
      <div class="list-row">
        <div>
          <div class="row-title">DemoCorp 信息科技岗</div>
          <div class="row-subtitle">附件缺失，需确认成绩单上传</div>
        </div>
        <span class="muted">投递跟踪</span>
        ${pill("待处理附件", "amber")}
        ${button("处理", "primary", 'data-action="go-tracking"')}
      </div>
      <div class="list-row">
        <div>
          <div class="row-title">DemoCorp数字化技术岗</div>
          <div class="row-subtitle">官网专业目录没有完全匹配项</div>
        </div>
        <span class="muted">简历预填</span>
        ${pill("低置信字段", "amber")}
        ${button("确认", "secondary", 'data-action="go-prefill"')}
      </div>
      <div class="list-row">
        <div>
          <div class="row-title">DemoCorp</div>
          <div class="row-subtitle">验证码等待人工输入</div>
        </div>
        <span class="muted">注册登录协作</span>
        ${pill("当前阻塞", "red")}
        ${button("打开", "secondary", 'data-action="go-auth"')}
      </div>
    </div>
  `;
}

function renderCaptureReview() {
  const checks = [
    ["来源可信", "官网/可信公众号原文", "待确认"],
    ["字段完整", "公司、岗位、地区、截止时间", "待确认"],
    ["岗位适配", "校园招聘、计算机方向、地区A", "待确认"],
    ["入库动作", "确认后才进入岗位库", "未放行"],
  ];
  return checks.map(([title, desc, status], index) => `
    <div class="question ${index === 3 ? "warn" : ""}">
      <div class="status-row" style="justify-content:space-between">
        <strong>${title}</strong>
        ${pill(status, index === 3 ? "red" : "amber")}
      </div>
      <div class="muted" style="margin-top:8px">${desc}</div>
    </div>
  `).join("");
}

function renderSourceRow(title, desc, count, status, color) {
  return `<div class="list-row"><div class="row-title">${title}</div><div class="muted">${desc}</div>${pill(count, "blue")}${pill(status, color)}</div>`;
}

function renderSourceEditorRow(title, value, status) {
  const tone = status === "正常" ? "green" : status === "需扩展" ? "amber" : "blue";
  return `
    <div class="source-row">
      <label class="control">
        <span>${title}</span>
        <input value="${value}" />
      </label>
      ${pill(status, tone)}
    </div>
  `;
}

function renderJobEvidence(job) {
  const rows = [
    ["来源类型", job.sourceType || "待补充"],
    ["来源链接", job.sourceUrl || "待补充"],
    ["批次", job.batch || "校园招聘"],
    ["首次发现", job.firstSeenAt || "今日抓取"],
    ["证据编号", job.evidenceId || "未生成"],
  ];
  return `
    <div class="evidence-box">
      <div class="field-label">抓取证据</div>
      ${rows.map(([label, value]) => `
        <div class="evidence-row">
          <span class="muted">${label}</span>
          <strong>${value}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderReviewChecklist() {
  const checks = [
    ["source_confirmed", "来源可信", "官网、可信公众号或可回溯原文，不以示例公司线索作为最终证据"],
    ["fields_confirmed", "字段完整", "公司、岗位名称、地区、批次、投递入口已经核对"],
    ["deadline_confirmed", "截止时间已确认", "有明确截止时间，或已人工确认官网暂未展示截止时间"],
    ["fit_confirmed", "岗位适配", "命中你的校园招聘、地区、计算机方向和岗位偏好"],
  ];
  return `
    <div class="review-checklist">
      <div class="field-label">人工确认清单</div>
      ${checks.map(([key, title, desc]) => `
        <label class="check-row">
          <input type="checkbox" data-review-check="${key}" ${state.reviewChecks[key] ? "checked" : ""} />
          <span>
            <strong>${title}</strong>
            <small>${desc}</small>
          </span>
        </label>
      `).join("")}
      <div class="muted">四项全部确认后，岗位才会进入注册登录协作链路。</div>
    </div>
  `;
}

function renderJobListRow(job) {
  return `<div class="list-row" ${job.id ? `data-job-id="${job.id}"` : ""}><div><div class="row-title">${job.company}</div><div class="row-subtitle">${job.note}</div></div><strong>${job.role}</strong><span class="muted">${job.region}</span><div class="row-actions">${pill(`匹配 ${job.score}`, "teal")}${pill(job.status || "待确认", job.rawStatus === "job_ready" ? "green" : "amber")}</div></div>`;
}

function renderJobTableRow(job, selected) {
  return `<tr class="${selected ? "selected" : ""}" ${job.id ? `data-job-id="${job.id}"` : ""}><td><strong>${job.company}</strong><div class="row-subtitle">${job.note}</div></td><td>${job.role}</td><td>${job.region}</td><td>${job.score}</td><td>${pill(job.status, job.status.includes("待") || job.status.includes("协作") ? "amber" : "green")}</td></tr>`;
}

function renderEvidence() {
  return [
    ["官网 URL", "已保存页面快照", "green"],
    ["岗位正文", "已抽取结构化字段", "green"],
    ["截止时间", "缺失时进入确认队列", "amber"],
    ["反爬/登录", "不绕过，标记人工处理", "blue"],
  ].map(([key, value, color]) => `<div class="status-row" style="margin:14px 0">${pill("", color)}<strong>${key}</strong><span class="muted">${value}</span></div>`).join("");
}

function renderLog(rows) {
  return rows.map(([time, text]) => `<div class="status-row" style="justify-content:flex-start;margin:13px 0"><span class="muted" style="min-width:76px">${time}</span><span>${text}</span></div>`).join("");
}

function renderMetricLine(label, value, color = "") {
  return `<div class="status-row" style="justify-content:space-between;margin:15px 0"><span class="muted">${label}</span><strong class="${color ? "" : "muted"}" style="${color ? `color: var(--${color})` : ""}">${value}</strong></div>`;
}

function renderFormMockRow(label, value) {
  return `<div class="form-row"><span class="muted">${label}</span><div class="input-like">${value}</div></div>`;
}

function renderQuestion(title, desc, status, tone = "") {
  return `<div class="question ${tone === "warn" ? "warn" : ""}"><div class="status-row" style="justify-content:space-between"><strong>${title}</strong>${status ? pill(status, tone === "warn" ? "amber" : "blue") : ""}</div><div class="muted" style="margin-top:8px">${desc}</div></div>`;
}

function renderFieldRow(row) {
  const [field, value, confidence, action] = row;
  const tone = confidence === "高" ? "green" : confidence === "中" ? "amber" : "red";
  const actionTone = action === "自动填入" ? "teal" : action === "向你提问" ? "red" : "blue";
  return `<tr><td><strong>${field}</strong></td><td>${value}</td><td>${pill(confidence, tone)}</td><td>${pill(action, actionTone)}</td></tr>`;
}

function confidenceLabel(confidence) {
  return { high: "高", medium: "中", low: "低" }[confidence] || confidence;
}

function actionLabel(action) {
  return { fill: "自动填入", ask_user: "需要确认", skip: "跳过" }[action] || action;
}

function renderProfileItem(label, value) {
  return `<div><div class="field-label">${label}</div><div>${value}</div></div>`;
}

async function init() {
  await refreshBackendData();
  renderShell();
}

init();
