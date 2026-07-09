const STORAGE_KEY = "lantai-data-v1";
const THEME_KEY = "lantai-theme";
const DATA_UPDATED_KEY = `${STORAGE_KEY}-updated`;
const DRAFT_KEY = "lantai-drafts-v1";
const UI_STATE_KEY = "lantai-ui-v1";
const DB_NAME = "lantai-db";
const DB_VERSION = 1;

const ui = {
  route: "workspace",
  theme: localStorage.getItem(THEME_KEY) || "lume",
  editingId: null,
  maskKind: "ai",
  attachments: [],
  sending: false,
  abortController: null,
  promptUnlocked: false,
  activeToolsId: null,
  suppressToolOpenOnce: false,
};

function syncViewportHeight() {
  const height = window.innerHeight || document.documentElement.clientHeight;
  document.documentElement.style.setProperty("--app-vh", `${height * 0.01}px`);
}

function setActiveMessageTools(id = null) {
  ui.activeToolsId = id;
  messagesEl?.querySelectorAll(".msg.tools-open").forEach((node) => {
    if (node.dataset.id !== id) node.classList.remove("tools-open");
  });
  if (id) {
    messagesEl?.querySelector(`.msg[data-id="${CSS.escape(id)}"]`)?.classList.add("tools-open");
  }
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const SEND_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" /></svg>`;
const STOP_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>`;

const defaults = {
  masks: {
    active: { ai: "ai-architect", user: "user-dev" },
    ai: [
      {
        id: "ai-architect",
        name: "默认协作",
        short: "澜",
        avatar: "",
        system: "",
        profile: "",
        injection: "始终读取本应用的基础工作规则，再叠加当前面具的设定与用户要求。",
        depth: "core",
        rules: "默认中文交流；普通聊天自然简洁；文件、代码、Markdown、表格和正式文档必须保持完整。",
        mcp: "第一版仅保留配置，不实际调用。",
      },
    ],
    user: [
      {
        id: "user-dev",
        name: "个人开发",
        short: "我",
        avatar: "",
        system: "",
        profile: "偏好中文交流，重视本地保存、桌面端体验和可控的上下文管理。",
        injection: "把用户面具视为长期身份设定，回答时持续参考。",
        depth: "core",
        rules: "回答简洁，重要取舍要说清楚。",
        mcp: "",
      },
    ],
  },
  messages: [
    {
      id: uid(),
      role: "user",
      kind: "text",
      text: "第一版先做好界面，再实装 API。桌面端优先，网页端也要舒服。",
    },
    {
      id: uid(),
      role: "assistant",
      kind: "text",
      versions: ["已切换为工作台布局。"],
      current: 0,
    },
    {
      id: uid(),
      role: "assistant",
      kind: "text",
      versions: ["普通聊天会按自然语气拆成多条消息；如果遇到代码、表格或文件内容，就会保持完整块，不会中途拆断。"],
      current: 0,
    },
    {
      id: uid(),
      role: "assistant",
      kind: "artifact",
      title: "界面调整清单",
      text: "输入框压低、状态减少、磨砂层重做、暗色主题重设。",
    },
    {
      id: uid(),
      role: "assistant",
      kind: "code",
      filename: "example.html",
      versions: [`<section class="glass-card">
  <h1>澜台</h1>
  <p>自然聊天，完整输出代码。</p>
</section>`],
      current: 0,
    },
  ],
  workspaces: {
    simple: {
      activeProjectId: "simple-project-main",
      activeSessionId: "simple-session-main",
      projects: [
        {
          id: "simple-project-main",
          name: "简易工作台",
          memory: [],
          sessions: [
            {
              id: "simple-session-main",
              title: "轻量会话",
              manualTitle: false,
              summary: "",
              summaryRecords: [],
              lastSummarizedTurn: 0,
              messages: [],
            },
          ],
        },
      ],
    },
    complex: {
      activeProjectId: "complex-project-main",
      activeSessionId: "complex-session-main",
      projects: [
        {
          id: "complex-project-main",
          name: "工坊",
          memory: [],
          sessions: [
            {
              id: "complex-session-main",
              title: "工坊会话",
              manualTitle: false,
              summary: "",
              summaryRecords: [],
              lastSummarizedTurn: 0,
              workPlan: { current: 0, total: 0, state: "", steps: [] },
              messages: [],
            },
          ],
        },
      ],
    },
  },
  settings: {
    summaryEvery: 30,
    sharedMemory: false,
    humanSplit: true,
    workMode: "simple",
    simplePromptOverride: "",
    complexPromptOverride: "",
    themeBackgrounds: {},
    userMemory: [],
    agent: {
      enabled: false,
      baseUrl: "http://127.0.0.1:8787",
      status: "\u672a\u8fde\u63a5",
      root: "~/lantai-projects",
      autoRepairOnce: false,
    },
    globalMemory: [],
    activeApiId: "api-main",
    apiConfigs: [
      {
        id: "api-main",
        name: "NewAPI 主线",
        baseUrl: "https://api.example.com/v1",
        apiKey: "",
        endpoint: "chat/completions",
        model: "",
        models: [],
        stream: true,
      },
    ],
  },
};

function structuredCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanLegacyText(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/还没有完\?API 配置。请在设置里填写 Base URL、API Key，并选择模型\?/g, "还没有完整 API 配置。请在设置里填写 Base URL、API Key，并选择模型。")
    .replace(/接口返回为空\?/g, "接口返回为空。")
    .replace(/API 请求失败\?"\{([^}]+)\}。/g, "API 请求失败：$1。")
    .replace(/NewAPI 主线\?/g, "NewAPI 主线")
    .replace(/未命名线\?/g, "未命名线路")
    .replace(/个人开发\?/g, "个人开发")
    .replace(/产品架构\?/g, "默认协作")
    .replace(/始终读取本应用的基础工作规则，再叠加当前面具的设定与用户要求\?/g, "始终读取本应用的基础工作规则，再叠加当前面具的设定与用户要求。")
    .replace(/默认中文交流；普通聊天自然简洁；文件、代码、Markdown、表格和正式文档必须保持完整\?/g, "默认中文交流；普通聊天自然简洁；文件、代码、Markdown、表格和正式文档必须保持完整。")
    .replace(/第一版仅保留配置，不实际调用\?/g, "第一版仅保留配置，不实际调用。")
    .replace(/回答简洁，重要取舍要说清楚\?/g, "回答简洁，重要取舍要说清楚。")
    .replace(/偏好中文交流，重视本地保存、桌面端体验和可控的上下文管理\?/g, "偏好中文交流，重视本地保存、桌面端体验和可控的上下文管理。");
}

function cleanLegacyMessage(message = {}) {
  ["text", "title", "filename", "reasoning", "agentCheckDetail"].forEach((key) => {
    if (typeof message[key] === "string") message[key] = cleanLegacyText(message[key]);
  });
  if (Array.isArray(message.versions)) {
    message.versions = message.versions.map((item) => cleanLegacyText(item));
  }
  if (Array.isArray(message.attachments)) {
    message.attachments.forEach((file) => {
      if (typeof file.name === "string") file.name = cleanLegacyText(file.name);
      if (typeof file.text === "string") file.text = cleanLegacyText(file.text);
    });
  }
  return message;
}

function createWorkspaceDefaults(mode) {
  const projectId = `${mode}-project-main`;
  const sessionId = `${mode}-session-main`;
  return {
    activeProjectId: projectId,
    activeSessionId: sessionId,
    projects: [
      {
        id: projectId,
        name: mode === "complex" ? "工坊" : "简易工作台",
        memory: [],
        sessions: [
          {
            id: sessionId,
            title: mode === "complex" ? "工坊会话" : "轻量会话",
            manualTitle: false,
            mode,
            summary: "",
            summaryRecords: [],
            lastSummarizedTurn: 0,
            workPlan: mode === "complex" ? { current: 0, total: 0, state: "", steps: [] } : { current: 0, total: 0, state: "", steps: [] },
            messages: mode === "simple" ? structuredCopy(defaults.messages) : [],
          },
        ],
      },
    ],
  };
}

function normalizeWorkspace(workspace, mode) {
  const base = createWorkspaceDefaults(mode);
  const next = { ...base, ...(workspace || {}) };
  next.projects = Array.isArray(next.projects) && next.projects.length ? next.projects : structuredCopy(base.projects);
  if (!next.activeProjectId || !next.projects.some((project) => project.id === next.activeProjectId)) {
    next.activeProjectId = next.projects[0].id;
  }
  const project = next.projects.find((item) => item.id === next.activeProjectId) || next.projects[0];
  next.projects.forEach((item) => {
    item.memory = Array.isArray(item.memory) ? item.memory : [];
    item.sessions = Array.isArray(item.sessions) && item.sessions.length
      ? item.sessions
      : [{ id: uid(), title: mode === "complex" ? "工坊会话" : "新的会话", mode, summary: "", lastSummarizedTurn: 0, messages: [] }];
    item.sessions.forEach((session) => {
      session.mode = mode;
      session.messages = Array.isArray(session.messages) ? session.messages : [];
      session.messages = session.messages.map(cleanLegacyMessage);
      session.summary = session.summary || "";
      session.summaryRecords = Array.isArray(session.summaryRecords) ? session.summaryRecords : [];
      session.lastSummarizedTurn = Number(session.lastSummarizedTurn) || 0;
      session.manualTitle = Boolean(session.manualTitle);
      session.workPlan = session.workPlan && typeof session.workPlan === "object"
        ? {
          current: Number(session.workPlan.current) || 0,
          total: Number(session.workPlan.total) || 0,
          state: session.workPlan.state || "",
          steps: Array.isArray(session.workPlan.steps) ? session.workPlan.steps : [],
        }
        : { current: 0, total: 0, state: "", steps: [] };
    });
  });
  if (!next.activeSessionId || !project.sessions.some((session) => session.id === next.activeSessionId)) {
    next.activeSessionId = project.sessions[0].id;
  }
  return next;
}

function normalizeData(value) {
  const base = structuredCopy(defaults);
  if (!value) return base;
  const next = { ...base, ...value };

  if (!next.masks?.active) {
    const oldAi = value.masks?.ai || {};
    const oldUser = value.masks?.user || {};
    next.masks = structuredCopy(defaults.masks);
    next.masks.ai[0].avatar = oldAi.avatar || "";
    next.masks.ai[0].short = oldAi.name || "澜";
    next.masks.user[0].avatar = oldUser.avatar || "";
    next.masks.user[0].short = oldUser.name || "我";
  }

  ["ai", "user"].forEach((kind) => {
    if (!Array.isArray(next.masks[kind]) || next.masks[kind].length === 0) {
      next.masks[kind] = structuredCopy(defaults.masks[kind]);
    }
    if (!next.masks.active[kind] || !next.masks[kind].some((mask) => mask.id === next.masks.active[kind])) {
      next.masks.active[kind] = next.masks[kind][0].id;
    }
  });
  next.masks.ai.forEach((mask) => {
    ["name", "short", "system", "profile", "injection", "rules", "mcp"].forEach((key) => {
      mask[key] = cleanLegacyText(mask[key]);
    });
    if (mask.id === "ai-architect" && mask.name === "产品架构师") {
      mask.name = "默认协作";
    }
    if (mask.id === "ai-architect" && String(mask.system || "").includes("AI")) {
      mask.system = "";
    }
    if (mask.id === "ai-architect" && mask.injection === "始终优先读取当前面具的核心设定，并在回答中遵守这些规则。") {
      mask.injection = "始终读取本应用的基础工作规则，再叠加当前面具的设定与用户要求。";
    }
  });
  next.masks.user.forEach((mask) => {
    ["name", "short", "system", "profile", "injection", "rules", "mcp"].forEach((key) => {
      mask[key] = cleanLegacyText(mask[key]);
    });
  });

  next.messages = Array.isArray(next.messages) ? next.messages : structuredCopy(defaults.messages);
  if (!next.workspaces) {
    next.workspaces = {
      simple: {
        activeProjectId: next.activeProjectId,
        activeSessionId: next.activeSessionId,
        projects: Array.isArray(next.projects) && next.projects.length
          ? next.projects
          : createWorkspaceDefaults("simple").projects,
      },
      complex: createWorkspaceDefaults("complex"),
    };
  }
  next.workspaces.simple = normalizeWorkspace(next.workspaces.simple, "simple");
  next.workspaces.complex = normalizeWorkspace(next.workspaces.complex, "complex");
  delete next.projects;
  delete next.activeProjectId;
  delete next.activeSessionId;
  next.trash = Array.isArray(next.trash) ? next.trash : [];
  next.settings = { ...base.settings, ...(next.settings || {}) };
  next.settings.summaryEvery = Number(next.settings.summaryEvery) || 30;
  next.settings.sharedMemory = Boolean(next.settings.sharedMemory);
  next.settings.humanSplit = next.settings.humanSplit !== false;
  next.settings.workMode = ["simple", "complex"].includes(next.settings.workMode) ? next.settings.workMode : "simple";
  next.settings.simplePromptOverride = next.settings.simplePromptOverride || next.settings.basePromptOverride || "";
  next.settings.complexPromptOverride = next.settings.complexPromptOverride || next.settings.basePromptOverride || "";
  next.settings.themeBackgrounds = next.settings.themeBackgrounds && typeof next.settings.themeBackgrounds === "object"
    ? next.settings.themeBackgrounds
    : {};
  delete next.settings.basePromptOverride;
  next.settings.userMemory = Array.isArray(next.settings.userMemory) ? next.settings.userMemory : [];
  next.settings.agent = {
    ...base.settings.agent,
    ...(next.settings.agent || {}),
  };
  next.settings.agent.enabled = Boolean(next.settings.agent.enabled);
  next.settings.agent.baseUrl = next.settings.agent.baseUrl || base.settings.agent.baseUrl;
  next.settings.agent.status = next.settings.agent.status || "\u672a\u8fde\u63a5";
  next.settings.agent.root = next.settings.agent.root || base.settings.agent.root;
  next.settings.agent.autoRepairOnce = Boolean(next.settings.agent.autoRepairOnce);
  next.settings.globalMemory = Array.isArray(next.settings.globalMemory) ? next.settings.globalMemory : [];
  if (!Array.isArray(next.settings.apiConfigs) || next.settings.apiConfigs.length === 0) {
    next.settings.apiConfigs = structuredCopy(base.settings.apiConfigs);
  }
  next.settings.apiConfigs = next.settings.apiConfigs.map((config) => ({
    id: config.id || uid(),
    name: cleanLegacyText(config.name) || "未命名线路",
    baseUrl: config.baseUrl || "",
    apiKey: config.apiKey || "",
    endpoint: config.endpoint || "chat/completions",
    model: config.model || "",
    models: Array.isArray(config.models) ? config.models : [],
    stream: config.stream !== false,
  }));
  if (!next.settings.activeApiId || !next.settings.apiConfigs.some((config) => config.id === next.settings.activeApiId)) {
    next.settings.activeApiId = next.settings.apiConfigs[0].id;
  }
  next.messages = activeLegacyMessages(next);
  return next;
}

function activeLegacyMessages(next) {
  const workspace = next.workspaces?.simple || createWorkspaceDefaults("simple");
  const project = workspace.projects.find((item) => item.id === workspace.activeProjectId) || workspace.projects[0];
  const session = project.sessions.find((item) => item.id === workspace.activeSessionId) || project.sessions[0];
  return session.messages;
}

function loadData() {
  try {
    return normalizeData(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return normalizeData(null);
  }
}

let data = loadData();
const body = document.body;
body.dataset.theme = ui.theme;

const messagesEl = document.querySelector("#messages");
const composerInput = document.querySelector("#composerInput");
const sendButton = document.querySelector("#sendButton");
const attachmentTray = document.querySelector("#attachmentTray");
const imageInput = document.querySelector("#imageInput");
const fileInput = document.querySelector("#fileInput");
const addImageButton = document.querySelector("#addImageButton");
const addFileButton = document.querySelector("#addFileButton");
const quickModelButton = document.querySelector("#quickModelButton");
const projectList = document.querySelector("#projectList");
const sessionList = document.querySelector("#sessionList");
const sessionTitle = document.querySelector("#sessionTitle");
const workSteps = document.querySelector("#workSteps");
const workStepLabel = document.querySelector("#workStepLabel");
const workStepState = document.querySelector("#workStepState");
const workStepList = document.querySelector("#workStepList");
const summaryProgress = document.querySelector("#summaryProgress");
const summaryProgressFill = document.querySelector("#summaryProgressFill");
const summaryProgressTip = document.querySelector("#summaryProgressTip");
const summaryEveryInput = document.querySelector("#summaryEveryInput");
const summaryEveryLabel = document.querySelector("#summaryEveryLabel");
const sharedMemoryToggle = document.querySelector("#sharedMemoryToggle");
const projectMemoryCount = document.querySelector("#projectMemoryCount");
const globalMemoryState = document.querySelector("#globalMemoryState");
const manualSummaryButton = document.querySelector("#manualSummaryButton");
const userMemoryInput = document.querySelector("#userMemoryInput");
const addUserMemoryButton = document.querySelector("#addUserMemoryButton");
const userMemoryList = document.querySelector("#userMemoryList");
const summaryRecordsList = document.querySelector("#summaryRecordsList");
const toggleSummaryRecordsButton = document.querySelector("#toggleSummaryRecordsButton");
const trashList = document.querySelector("#trashList");
const trashCount = document.querySelector("#trashCount");
const emptyTrashButton = document.querySelector("#emptyTrashButton");
const exportBackupButton = document.querySelector("#exportBackupButton");
const importBackupButton = document.querySelector("#importBackupButton");
const backupFileInput = document.querySelector("#backupFileInput");
const backupTextOutput = document.querySelector("#backupTextOutput");
const copyBackupText = document.querySelector("#copyBackupText");
const backupStatusText = document.querySelector("#backupStatusText");
const pasteBackupButton = document.querySelector("#pasteBackupButton");
const backupPasteInput = document.querySelector("#backupPasteInput");
const importBackupTextButton = document.querySelector("#importBackupTextButton");
const imagePreview = document.querySelector("#imagePreview");
const imagePreviewTitle = document.querySelector("#imagePreviewTitle");
const confirmModal = document.querySelector('[data-modal="confirm"]');
const confirmTitle = document.querySelector("#confirmTitle");
const confirmBody = document.querySelector("#confirmBody");
const confirmInput = document.querySelector("#confirmInput");
const confirmCancel = document.querySelector("#confirmCancel");
const confirmReject = document.querySelector("#confirmReject");
const confirmOk = document.querySelector("#confirmOk");
const toastStack = document.querySelector("#toastStack");
let pendingConfirm = null;
let pendingConfirmCancel = null;
let pendingConfirmReject = null;

const maskList = document.querySelector("#maskList");
const maskNameInput = document.querySelector("#maskNameInput");
const maskShortInput = document.querySelector("#maskShortInput");
const maskSystemInput = document.querySelector("#maskSystemInput");
const maskProfileInput = document.querySelector("#maskProfileInput");
const maskInjectionInput = document.querySelector("#maskInjectionInput");
const maskPromptPreview = document.querySelector("#maskPromptPreview");
const maskDepthInput = document.querySelector("#maskDepthInput");
const maskRulesInput = document.querySelector("#maskRulesInput");
const maskMcpInput = document.querySelector("#maskMcpInput");
const maskKindLabel = document.querySelector("#maskKindLabel");
const maskEditorTitle = document.querySelector("#maskEditorTitle");
const maskAvatarPreview = document.querySelector("#maskAvatarPreview");
const maskAvatarInput = document.querySelector("#maskAvatarInput");
const drawerTitle = document.querySelector("#drawerTitle");
const drawerContent = document.querySelector("#drawerContent");
const drawerViewButtons = document.querySelectorAll("[data-drawer-view]");
const command = document.querySelector(".command-palette");
const commandSearchInput = document.querySelector("#commandSearchInput");
const commandResults = document.querySelector("#commandResults");
const apiConfigList = document.querySelector("#apiConfigList");
const apiNameInput = document.querySelector("#apiNameInput");
const apiBaseUrlInput = document.querySelector("#apiBaseUrlInput");
const apiKeyInput = document.querySelector("#apiKeyInput");
const apiEndpointInput = document.querySelector("#apiEndpointInput");
const apiModelSelect = document.querySelector("#apiModelSelect");
const apiModelManualInput = document.querySelector("#apiModelManualInput");
const apiStreamToggle = document.querySelector("#apiStreamToggle");
const humanSplitToggle = document.querySelector("#humanSplitToggle");
const apiStatusText = document.querySelector("#apiStatusText");
const newApiConfigButton = document.querySelector("#newApiConfigButton");
const saveApiConfigButton = document.querySelector("#saveApiConfigButton");
const deleteApiConfigButton = document.querySelector("#deleteApiConfigButton");
const fetchModelsButton = document.querySelector("#fetchModelsButton");
const promptPasswordInput = document.querySelector("#promptPasswordInput");
const unlockPromptButton = document.querySelector("#unlockPromptButton");
const simplePromptEditor = document.querySelector("#simplePromptEditor");
const complexPromptEditor = document.querySelector("#complexPromptEditor");
const saveBasePromptButton = document.querySelector("#saveBasePromptButton");
const resetBasePromptButton = document.querySelector("#resetBasePromptButton");
const themeBgPanel = document.querySelector("#themeBgPanel");
const themeBgHint = document.querySelector("#themeBgHint");
const themeBgPreview = document.querySelector("#themeBgPreview");
const themeBgFile = document.querySelector("#themeBgFile");
const themeBgUrl = document.querySelector("#themeBgUrl");
const applyThemeBgUrl = document.querySelector("#applyThemeBgUrl");
const resetThemeBg = document.querySelector("#resetThemeBg");
const agentBaseUrlInput = document.querySelector("#agentBaseUrlInput");
const agentRootInput = document.querySelector("#agentRootInput");
const agentEnabledToggle = document.querySelector("#agentEnabledToggle");
const agentAutoRepairToggle = document.querySelector("#agentAutoRepairToggle");
const agentStatusText = document.querySelector("#agentStatusText");
const agentCheckButton = document.querySelector("#agentCheckButton");
const saveAgentButton = document.querySelector("#saveAgentButton");
const agentCopyCommandButton = document.querySelector("#agentCopyCommandButton");
const agentCommandText = document.querySelector("#agentCommandText");

function dataForLocalStorage({ keepBackgrounds = true } = {}) {
  const snapshot = structuredCopy(data);
  if (!keepBackgrounds && snapshot.settings?.themeBackgrounds) {
    Object.keys(snapshot.settings.themeBackgrounds).forEach((theme) => {
      const value = snapshot.settings.themeBackgrounds[theme];
      if (typeof value === "string" && value.startsWith("data:")) {
        snapshot.settings.themeBackgrounds[theme] = "__indexeddb__";
      }
    });
  }
  return snapshot;
}

function saveData() {
  const updatedAt = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataForLocalStorage()));
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataForLocalStorage({ keepBackgrounds: false })));
    } catch {
      // IndexedDB remains the durable store when localStorage quota is exceeded.
    }
  }
  try {
    localStorage.setItem(DATA_UPDATED_KEY, String(updatedAt));
  } catch {
    // Ignore localStorage quota errors; IndexedDB still receives the full state.
  }
  mirrorToIndexedDB(updatedAt);
}

function openLocalDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("state")) db.createObjectStore("state");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function mirrorToIndexedDB(updatedAt = Date.now()) {
  try {
    const db = await openLocalDB();
    if (!db) return;
    const tx = db.transaction("state", "readwrite");
    tx.objectStore("state").put({ data: structuredCopy(data), theme: ui.theme, updatedAt }, "app");
  } catch {
    // localStorage remains the active store until the IndexedDB migration is complete.
  }
}

async function readIndexedDBState() {
  try {
    const db = await openLocalDB();
    if (!db) return null;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("state", "readonly");
      const request = tx.objectStore("state").get("app");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

function hasIndexedBackgroundMarker() {
  return Object.values(data.settings.themeBackgrounds || {}).some((value) => value === "__indexeddb__");
}

async function restoreIndexedDBState() {
  const record = await readIndexedDBState();
  if (!record?.data) return;
  const localUpdated = Number(localStorage.getItem(DATA_UPDATED_KEY)) || 0;
  if (!hasIndexedBackgroundMarker() && localUpdated && Number(record.updatedAt || 0) <= localUpdated) return;
  data = normalizeData(record.data);
  if (record.theme) ui.theme = record.theme;
  setTheme(ui.theme);
  renderMasks();
  renderWorkspace({ keepScroll: true });
  restoreComposerDraft();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function currentText(message) {
  if (message.kind === "activity") {
    const details = Array.isArray(message.details) ? message.details : [];
    return [message.title || "Agent activity", ...details].filter(Boolean).join("\n\n");
  }
  if (message.versions) return message.versions[message.current] || "";
  return message.text || "";
}

function getActiveMask(role) {
  const kind = role === "user" ? "user" : "ai";
  const list = data.masks[kind];
  return list.find((mask) => mask.id === data.masks.active[kind]) || list[0];
}

function avatarMarkup(mask) {
  if (mask.avatar) return `<img src="${mask.avatar}" alt="">`;
  return escapeHtml(mask.short || mask.name.slice(0, 1));
}

function avatarHtml(role) {
  return avatarMarkup(getActiveMask(role));
}

function formatBytes(size = 0) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function activeWorkspace(mode = data.settings.workMode || "simple") {
  data.workspaces ||= {};
  data.workspaces[mode] ||= normalizeWorkspace(null, mode);
  return data.workspaces[mode];
}

function activeProject() {
  const workspace = activeWorkspace();
  return workspace.projects.find((project) => project.id === workspace.activeProjectId) || workspace.projects[0];
}

function activeSession() {
  const project = activeProject();
  const workspace = activeWorkspace();
  return project.sessions.find((session) => session.id === workspace.activeSessionId) || project.sessions[0];
}

function ensureSessionForMode(mode = data.settings.workMode || "simple") {
  const workspace = activeWorkspace(mode);
  const project = activeProject();
  let session = project.sessions.find((item) => item.id === workspace.activeSessionId);
  if (!session) session = project.sessions[0];
  if (!session) {
    session = {
      id: uid(),
      title: mode === "complex" ? "工坊会话" : "新的会话",
      manualTitle: false,
      mode,
      summary: "",
      summaryRecords: [],
      lastSummarizedTurn: 0,
      workPlan: mode === "complex" ? defaultWorkPlan() : { current: 0, total: 0, state: "", steps: [] },
      messages: [],
    };
    project.sessions.push(session);
  }
  workspace.activeSessionId = session.id;
  return session;
}

function activeMessages() {
  const session = activeSession();
  if (!Array.isArray(session.messages)) session.messages = [];
  return session.messages;
}

function activeDraftKey() {
  const workspace = activeWorkspace();
  return [
    data.settings.workMode || "simple",
    workspace.activeProjectId || "project",
    workspace.activeSessionId || "session",
  ].join(":");
}

function readDrafts() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {};
  } catch {
    localStorage.removeItem(DRAFT_KEY);
    return {};
  }
}

function writeDrafts(drafts) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  } catch {
    // Drafts are best-effort only.
  }
}

function saveComposerDraft() {
  if (!composerInput) return;
  const drafts = readDrafts();
  const key = activeDraftKey();
  const value = composerInput.value;
  if (value) drafts[key] = { text: value, updatedAt: Date.now() };
  else delete drafts[key];
  writeDrafts(drafts);
}

function clearComposerDraft() {
  const drafts = readDrafts();
  delete drafts[activeDraftKey()];
  writeDrafts(drafts);
}

function restoreComposerDraft() {
  if (!composerInput || ui.sending) return;
  const draft = readDrafts()[activeDraftKey()];
  composerInput.value = draft?.text || "";
}

function visibleMessages() {
  const messages = activeMessages();
  const visible = messages.filter((message) => !message.archived);
  if (!visible.length && messages.length) {
    messages.slice(-24).forEach((message) => {
      message.archived = false;
    });
    visibleMessages.restored = true;
    return messages.filter((message) => !message.archived);
  }
  visibleMessages.restored = false;
  return visible;
}

function activeApiConfig() {
  const configs = data.settings.apiConfigs;
  return configs.find((config) => config.id === data.settings.activeApiId) || configs[0];
}

function hasUsableApiConfig() {
  const config = activeApiConfig();
  return Boolean(config?.baseUrl?.trim() && config?.apiKey?.trim() && config?.model?.trim());
}

function promptApiRequiredForSummary() {
  showToast("总结失败", "未配置完整 API：请先填写接口地址、Key，并选择模型。", "error");
}

function syncApiFormToActive() {
  const config = activeApiConfig();
  if (!config) return null;
  config.name = apiNameInput.value.trim() || "未命名线路";
  config.baseUrl = apiBaseUrlInput.value.trim();
  config.apiKey = apiKeyInput.value.trim();
  config.endpoint = apiEndpointInput.value || "chat/completions";
  config.model = apiModelManualInput?.value.trim() || apiModelSelect.value || config.model || "";
  config.stream = apiStreamToggle.checked;
  return config;
}

function renderApiConfigs(status = "") {
  if (!apiConfigList) return;
  const config = activeApiConfig();
  apiConfigList.innerHTML = data.settings.apiConfigs.map((item) => `
    <button class="api-item ${item.id === data.settings.activeApiId ? "active" : ""}" data-api-id="${item.id}">
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(item.model || "未选择模型")}</span>
    </button>
  `).join("");

  if (config) {
    apiNameInput.value = config.name || "";
    apiBaseUrlInput.value = config.baseUrl || "";
    apiKeyInput.value = config.apiKey || "";
    apiEndpointInput.value = config.endpoint || "chat/completions";
    apiStreamToggle.checked = config.stream !== false;
    humanSplitToggle.checked = data.settings.humanSplit !== false;
    if (apiModelManualInput) apiModelManualInput.value = config.model || "";
    const models = config.models?.length ? config.models : [config.model || ""].filter(Boolean);
    apiModelSelect.innerHTML = models.length
      ? models.map((model) => `<option ${model === config.model ? "selected" : ""}>${escapeHtml(model)}</option>`).join("")
      : `<option value="">先拉取模型</option>`;
  }
  apiStatusText.textContent = status || "配置只保存在本地浏览器。";
}

function termuxInstallCommand() {
  return [
    "pkg update -y",
    "pkg install -y nodejs git python",
    "mkdir -p ~/lantai-agent ~/lantai-projects",
    "cd ~/lantai-agent",
    "# 把澜台 termux-agent 文件夹里的 package.json 和 server.js 放到这里",
    "node server.js",
  ].join("\n");
}

function renderAgentSettings(status = "") {
  if (!agentBaseUrlInput) return;
  const agent = data.settings.agent;
  agentBaseUrlInput.value = agent.baseUrl || "http://127.0.0.1:8787";
  agentRootInput.value = agent.root || "~/lantai-projects";
  agentEnabledToggle.checked = Boolean(agent.enabled);
  if (agentAutoRepairToggle) agentAutoRepairToggle.checked = Boolean(agent.autoRepairOnce);
  agentStatusText.textContent = status || agent.status || "\u672a\u8fde\u63a5";
  agentCommandText.textContent = termuxInstallCommand();
}

function sharedBasePrompt() {
  return `这是一个本地 AI 聊天与工作台网页。它用于中文聊天、方案协作、代码编写、文档整理、图片与附件分析、上下文总结、产物卡片生成，以及把可识别的内容导出为本地文件。默认使用中文回复，除非用户明确要求其它语言。
你的基本定位是聪明、真实、独立的合作伙伴。不要无原则附和用户，也不要为了显得顺从而确认明显有问题的方案。你需要理解需求、记住约束、判断可行性，并在必要时直接反驳、纠正或提出更好的替代方案。你可以遵循用户在 AI 面具里给出的人设和风格，但这些人设必须叠加在本应用的基础工作规则之上，不能覆盖安全、准确、可执行和独立判断。
你的工作程序：先仔细理解用户需求，再提炼关键约束，然后思考解决方案，接着反推这个方案如果由真人实际操作，最终产物是否能成立、是否方便使用、是否会出错。这个反推步骤不能省略。方案可行时，说明结论和做法；方案不可行时，说明原因、利弊和推荐方案。执行时要大胆但稳，边做边检查；发现错误要及时停下纠正，判断是局部补救还是从头来过，不能顺着错误继续。
你在这个网页中的输出能力：可以输出普通聊天文本、Markdown、代码、HTML、CSS、JS、JSON、TXT、配置、说明文档、产物卡片和可被网页下载的文件内容。需要生成文件时，不要说“我无法生成文件”。正确做法是输出文件内容源，让网页把它变成可下载文件。代码或具体文件必须使用独立代码块，并在代码块语言或代码块上一行写清文件名，例如“文件：index.html”或 \`\`\`html。写“文件：index.html”时不要用反引号包裹文件名，不要写成“文件：\`index.html\`”。多个文件必须分成多个独立代码块。
交付文件时要替用户想完整：不要只列文件名，还要用简短自然的话说明每个文件的具体作用、用户应该怎么打开或放置、是否依赖其它文件、下一步如何测试。说明要实用，不要堆空话；如果文件之间有关系，要交代清楚先后和用途。
DOCX 的规则：你不需要直接创建二进制 docx。你要负责产出适合导出 DOCX 的正文、Markdown 或产物卡片内容，网页会在用户点击 DOCX 时本地打包下载。用户要 docx 时，优先给出一个清晰的产物卡片或 Markdown 文档内容，并提醒可以点击 DOCX 下载。
产物卡片的规则：如果要让网页生成产物卡片，必须真的输出以下格式，不能只口头说“已生成”。格式为：
产物卡片：标题
这里写卡片正文，正文可以多行。
思考内容的规则：不要在正文里输出“思维链”“推理过程”或 <think> 标签。普通用户只需要看到结论、必要理由和执行结果。如果接口单独提供 reasoning 内容，网页会用“正在思考”折叠显示；正文仍然保持干净。
语言与示例规则：不要无故输出英文示例、Hello world、hello_world 或 python 这类演示代码。只有用户明确要求写某种代码时，才输出对应代码块；代码里的示例文案、注释和说明默认尽量使用中文。普通聊天不要出现孤立的语言名、横线分隔符、反引号包裹的文件名或 Markdown 装饰符。`;
}

function defaultSimplePrompt() {
  return `${sharedBasePrompt()}

简易工作台：适合聊天、轻量方案、文案、单个文件、小型代码片段和快速问答。你的主要目标是快速、自然、准确地帮用户推进问题，不要把简易任务误判成复杂工程。
简易工作台的能力边界：可以回答问题、解释概念、帮用户做取舍、写短文案、整理轻量清单、生成单个文件或小段代码。一般不需要要求用户使用 Agent、快照、审计或运行检查。只有当用户的问题明显变成多文件项目、复杂调试、需要真实运行检查、需要读取本地项目时，才主动建议切换到工坊，并说明原因。
你要保持独立判断：用户提出的方案可行就直接说明怎么做；不可行就说清楚为什么，给出更稳方案。不要为了顺从而忽略明显风险，也不要在信息不足时假装确定。缺少必要信息时，要明确告诉用户需要什么，并给出具体提问，例如“需要你补充目标平台、文件格式和使用场景”。
输出方式：普通聊天要像真人一样自然，不要堆 Markdown 符号。用户开启真人分段时，普通聊天可以短句分段；文件、代码、Markdown、表格和正式文档必须保持完整。需要用户操作时，必须说清位置、按钮名和步骤，例如“去设置里的 API 配置填 Base URL、API Key 和模型”。`;
}

function defaultComplexPrompt() {
  return `${sharedBasePrompt()}

工坊：这是独立于普通工作台的深度工作区，适合网站、应用、多文件项目、长文档、批量修改、排错、重构和需要真实检查的任务。你必须像一个会实际落地的协作者一样工作，而不是只把代码贴出来。
普通问答规则：如果用户只是提问、解释概念、询问建议、确认信息、聊天或让你判断可行性，不要启动复杂工作流程，不要输出计划步骤，不要生成文件卡片，直接用自然中文回答。只有用户明确要求写代码、改文件、生成可下载产物、排错、运行检查、整理长文档或完成一个实际工作任务时，才使用下面的工坊工作流。
你的工作方式要接近严谨的本地开发代理：读懂需求，拆清边界，制定步骤，执行修改，检查结果，发现问题就修正，再检查，最后交付。关键进度必须写在可见正文里，不能依赖隐藏思考承载。不要自己闷着做；需要用户提供信息、点击按钮、连接 Agent、上传文件、运行检查时，必须明确说出来，并说明位置和原因。
开始工坊任务时，先判断信息是否足够。如果足够，给出“计划步骤：”，每一步一行，写清要做什么、产物是什么、如何检查。步骤数量按任务规模决定，不要为了形式凑数。如果信息不足，不要硬做，要说明缺什么，并给用户一个最小操作指令。
你必须主动使用或建议使用右侧 Agent 能力：开工前不清楚项目结构时，说“现在需要你点右侧预览栏的「上下文读取」里的「快照」，让我读取项目结构”；接手旧项目或不确定环境时，说“建议先点「诊断」，确认项目类型和可运行检查”；需要找代码位置时，说“请点「搜索文件」，搜索关键词 xxx”；完成代码或修复后，说“现在建议点「运行检查」做真实验证”；用户怀疑 AI 是否真的写入或运行过时，说“可以点「审计」，查看最近写入文件和命令记录”；有长时间命令时，说“点「任务」查看运行状态和输出”。这些指令要写清按钮位置：右侧预览栏 -> 上下文读取 -> 对应按钮。
你要保持独立判断：用户方案不合理、成本过高、会破坏数据、缺少检查条件或需求冲突时，要直接指出，不要顺从推进。指出问题后要给出可执行替代方案。用户拒绝权限或 Agent 不可用时，不要停住，要改用可下载文件、ZIP、手动命令或分步说明继续交付。
输出结构必须稳定：先输出短的执行说明或最终说明，再输出文件代码块或产物卡片。不要把大段源码混进正文。网页会把代码块折叠成文件卡片，并在工坊里显示类似“Edited files”“Ran commands”的过程行。
产物输出规则：写代码、网页、配置、文档时，默认输出为可下载文件块或产物卡片，普通聊天正文只说明文件用途、放置方式、运行方式和注意点。不要把大量源码直接刷在正文里；只有用户明确要求“展开代码”或“用 Markdown 贴出来”时才完整展示源码。
Agent 规则：若用户启用了本地 Agent，网页可以把你输出的文件批量写入本地工作目录，可以读取项目快照，可以批量读取文件，可以搜索项目文本，可以创建目录、移动或删除文件，可以运行白名单检查命令，也可以启动较长时间任务并轮询输出，并会记录写入和命令审计。Agent 能识别 package.json 并优先运行 lint、test、build、typecheck、check 等项目脚本，也能对单个 JS、Python、JSON 文件做基础检查。你要优先把复杂工程拆成多个明确文件，让网页和 Agent 写入、预览、检查；不要把长代码刷在聊天正文里。移动、删除、写入和运行命令都要尊重用户确认。用户明确拒绝权限后，不要卡住等待，要改用可下载文件、ZIP、手动运行命令或说明替代方案继续交付。
真实检查规则：最终必须做检查。若已连接本地 Agent，要使用可用命令真实运行检查，例如 node --check、npm test、npm run build、python -m py_compile 或项目里已有的测试命令。检查失败时必须说明失败点，修复，再检查。若没有 Agent、没有依赖或浏览器环境无法运行，必须明确说“当前无法做真实运行检查”，给出原因和下一步连接或安装方式，绝对不能假装已经跑过。
最终交付格式：完成后先用简短中文说明“改了什么”“检查结果”“下一步怎么用”。如果需要用户继续操作，必须写清位置、按钮名和操作顺序。然后再给出文件代码块或产物卡片。正文不要出现 Markdown 标题符号、横线分隔符、英文演示代码或反引号包裹的文件名。`;
}

function activeBasePrompt() {
  if (data.settings.workMode === "complex") {
    return data.settings.complexPromptOverride || defaultComplexPrompt();
  }
  return data.settings.simplePromptOverride || defaultSimplePrompt();
}

function renderPromptSettings() {
  if (!simplePromptEditor || !complexPromptEditor) return;
  if (!ui.promptUnlocked) {
    [simplePromptEditor, complexPromptEditor].forEach((editor) => {
      editor.value = "";
      editor.disabled = true;
      editor.placeholder = "输入授权码后查看和编辑";
    });
    return;
  }
  simplePromptEditor.disabled = false;
  complexPromptEditor.disabled = false;
  simplePromptEditor.value = data.settings.simplePromptOverride || defaultSimplePrompt();
  complexPromptEditor.value = data.settings.complexPromptOverride || defaultComplexPrompt();
}

function saveAgentSettings(status = "\u5df2\u4fdd\u5b58 Agent \u914d\u7f6e") {
  data.settings.agent = {
    ...data.settings.agent,
    enabled: Boolean(agentEnabledToggle?.checked),
    baseUrl: agentBaseUrlInput?.value.trim() || "http://127.0.0.1:8787",
    root: agentRootInput?.value.trim() || "~/lantai-projects",
    autoRepairOnce: Boolean(agentAutoRepairToggle?.checked),
    status,
  };
  saveData();
  renderAgentSettings(status);
}

async function checkAgentConnection() {
  saveAgentSettings("\u6b63\u5728\u68c0\u67e5...");
  const baseUrl = data.settings.agent.baseUrl.replace(/\/+$/, "");
  try {
    const response = await fetch(`${baseUrl}/health`, { method: "GET" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const payload = await response.json();
    const status = `已连接：${payload.name || "lantai-agent"} ${payload.version || ""}`.trim();
    data.settings.agent.status = status;
    data.settings.agent.enabled = true;
    saveData();
    renderAgentSettings(status);
  } catch (error) {
    const status = `连接失败：${error?.message || "无法访问 Termux Agent"}`;
    data.settings.agent.status = status;
    saveData();
    renderAgentSettings(status);
  }
}

function createApiConfig() {
  const config = {
    id: uid(),
    name: `备用线路 ${data.settings.apiConfigs.length + 1}`,
    baseUrl: "",
    apiKey: "",
    endpoint: "chat/completions",
    model: "",
    models: [],
    stream: true,
  };
  data.settings.apiConfigs.push(config);
  data.settings.activeApiId = config.id;
  saveData();
  renderApiConfigs("已新建配置。");
}

function deleteActiveApiConfig() {
  const config = activeApiConfig();
  if (!config) return;
  if (data.settings.apiConfigs.length === 1) {
    renderApiConfigs("至少保留一个 API 配置。");
    return;
  }
  askConfirm({
    title: "删除 API 配置",
    body: `确定删除“${config.name}”吗？`,
    okText: "删除",
    onConfirm: () => {
      data.settings.apiConfigs = data.settings.apiConfigs.filter((item) => item.id !== config.id);
      data.settings.activeApiId = data.settings.apiConfigs[0].id;
      saveData();
      renderApiConfigs("已删除配置。");
    },
  });
}

function saveActiveApiConfig(status = "已保存配置。") {
  syncApiFormToActive();
  saveData();
  renderApiConfigs(status);
}

async function fetchModels() {
  const config = syncApiFormToActive();
  if (!config) return;
  if (!config.baseUrl || !config.apiKey) {
    renderApiConfigs("请先填写 Base URL 和 API Key。");
    return;
  }
  saveData();
  renderApiConfigs("正在拉取模型...");
  fetchModelsButton.disabled = true;
  try {
    const url = `${config.baseUrl.replace(/\/+$/, "")}/models`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const payload = await response.json();
    const models = (payload.data || [])
      .map((item) => item.id || item.name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    if (!models.length) throw new Error("接口返回为空");
    config.models = models;
    if (!models.includes(config.model)) config.model = models[0];
    saveData();
    renderApiConfigs(`已拉取 ${models.length} 个模型。`);
  } catch (error) {
    renderApiConfigs(`拉取失败：${error?.message || "浏览器或接口拒绝请求"}。如果站点不开放 /models，请手动填写模型名。`);
  } finally {
    fetchModelsButton.disabled = false;
  }
}

function latestHtmlCode() {
  return [...activeMessages()].reverse().find((message) => {
    const filename = (message.filename || "").toLowerCase();
    return message.kind === "code" && (filename.endsWith(".html") || currentText(message).trim().startsWith("<"));
  });
}

function drawerArtifacts() {
  return activeMessages().filter((message) => ["artifact", "code"].includes(message.kind));
}

function codeArtifacts() {
  return drawerArtifacts().filter((message) => message.kind === "code");
}

function renderDrawer() {
  if (!drawerContent) return;
  const project = activeProject();
  const session = activeSession();
  const aiMask = getActiveMask("assistant");
  const userMask = getActiveMask("user");
  const apiConfig = activeApiConfig();
  const view = ui.drawerView || "context";
  drawerViewButtons.forEach((button) => button.classList.toggle("active", button.dataset.drawerView === view));

  if (view === "context") {
    drawerTitle.textContent = "\u4e0a\u4e0b\u6587\u8bfb\u53d6";
    drawerContent.innerHTML = `
      <div class="drawer-panel">
        <div class="drawer-kv"><span>项目</span><strong>${escapeHtml(project.name)}</strong></div>
        <div class="drawer-kv"><span>会话</span><strong>${escapeHtml(session.title || "新的会话")}</strong></div>
        <div class="drawer-kv"><span>AI 面具</span><strong>${escapeHtml(aiMask.name)}</strong></div>
        <div class="drawer-kv"><span>用户面具</span><strong>${escapeHtml(userMask.name)}</strong></div>
        <div class="drawer-kv"><span>模型</span><strong>${escapeHtml(apiConfig?.model || "未选择")}</strong></div>
        <div class="drawer-kv"><span>\u603b\u7ed3\u8fdb\u5ea6</span><strong>${currentRoundCount()}/${Number(data.settings.summaryEvery) || 30}</strong></div>
        <div class="drawer-kv"><span>\u4f1a\u8bdd\u6458\u8981</span><strong>${session.summary ? "\u5df2\u751f\u6210" : "\u6682\u65e0"}</strong></div>
        <div class="drawer-kv"><span>\u5171\u4eab\u8bb0\u5fc6</span><strong>${data.settings.sharedMemory ? "\u5f00\u542f" : "\u5173\u95ed"}</strong></div>
        <div class="drawer-note">${escapeHtml(aiMask.injection || "\u5f53\u524d\u9762\u5177\u6682\u65e0\u63d0\u793a\u8bcd\u7f6e\u5165")}</div>
        ${data.settings.workMode === "complex" ? `
          <div class="preview-actions agent-actions">
            <button data-action="agent-diagnose" title="诊断：开工前检查项目类型、文件树、推荐命令和风险">诊断</button>
            <button data-action="agent-snapshot" title="快照：让 AI 读取当前项目结构和小文件内容">快照</button>
            <button data-action="agent-search" title="搜索文件：按关键词定位代码、文案或配置">搜索文件</button>
            <button data-action="agent-run-checks" title="运行检查：写完或修完后真实运行测试/构建/语法检查">运行检查</button>
            <button data-action="agent-audit-summary" title="审计：查看 Agent 最近实际写了什么、跑了什么、哪里失败">审计</button>
            <button data-action="agent-tasks" title="任务：查看长时间运行命令的状态和输出">任务</button>
          </div>
        ` : ""}
      </div>
    `;
    return;
  }

  if (view === "artifacts") {
    const artifacts = drawerArtifacts();
    const activeArtifact = artifacts.find((message) => message.id === ui.drawerArtifactId);
    drawerTitle.textContent = "\u4ea7\u7269\u6587\u4ef6";
    if (activeArtifact) {
      const content = activeArtifact.kind === "code" ? currentText(activeArtifact) : activeArtifact.text;
      drawerContent.innerHTML = `
        <div class="drawer-detail">
          <button data-action="drawer-back">\u8fd4\u56de\u5217\u8868</button>
          <strong>${escapeHtml(activeArtifact.filename || activeArtifact.title || "\u672a\u547d\u540d\u4ea7\u7269")}</strong>
          <div class="drawer-detail-actions">
            ${activeArtifact.kind === "code" ? `<button data-action="drawer-download-code" data-id="${activeArtifact.id}">\u4e0b\u8f7d\u6587\u4ef6</button>` : ""}
            <button data-action="drawer-download-docx" data-id="${activeArtifact.id}">\u5bfc\u51fa DOCX</button>
          </div>
          <pre>${escapeHtml(content || "")}</pre>
        </div>
      `;
      return;
    }
    drawerContent.innerHTML = artifacts.length ? `
      <div class="preview-actions">
        <button data-action="download-all-code">\u5168\u90e8\u4e0b\u8f7d</button>
        <button data-action="download-code-zip">\u4e0b\u8f7d ZIP</button>
        <button data-action="save-code-folder">\u4fdd\u5b58\u5230\u6587\u4ef6\u5939</button>
      </div>
      <div class="drawer-artifacts">
        ${artifacts.map((message) => `
          <button data-action="drawer-open-artifact" data-id="${message.id}">
            <span>${message.kind === "code" ? "\u4ee3\u7801" : "\u4ea7\u7269"}</span>
            <strong>${escapeHtml(message.filename || message.title || "\u672a\u547d\u540d\u4ea7\u7269")}</strong>
          </button>
        `).join("")}
      </div>
    ` : `<div class="drawer-empty">\u5f53\u524d\u4f1a\u8bdd\u8fd8\u6ca1\u6709\u4ea7\u7269</div>`;
    return;
  }

  const html = latestHtmlCode();
  const previewUrl = html ? agentPreviewUrl(html.agentPath) : "";
  drawerTitle.textContent = "HTML \u6c99\u76d2\u9884\u89c8";
  drawerContent.innerHTML = html ? `
    <div class="preview-actions">
      <button data-action="open-html-preview">${previewUrl ? "\u6d4f\u89c8\u5668\u6253\u5f00" : "\u65b0\u7a97\u53e3"}</button>
      <button data-action="drawer-download-code" data-id="${html.id}">下载</button>
    </div>
    ${previewUrl
      ? `<iframe class="html-sandbox" sandbox="allow-scripts allow-forms allow-modals allow-popups" src="${escapeHtml(previewUrl)}"></iframe>`
      : `<iframe class="html-sandbox" sandbox="allow-scripts" srcdoc="${escapeHtml(currentText(html))}"></iframe>`}
  ` : `<div class="drawer-empty">\u8fd8\u6ca1\u6709\u53ef\u9884\u89c8\u7684 HTML \u4ee3\u7801\u5757</div>`;
}

function messageTools(message) {
  if (message.role === "user") {
    return `
      <div class="msg-tools">
        <button data-action="edit" data-id="${message.id}" title="编辑" aria-label="编辑">✎</button>
        <button data-action="reroll-user" data-id="${message.id}" title="重发" aria-label="重发">↻</button>
      </div>
    `;
  }
  const versionTools = message.versions?.length > 1 ? `
    <button data-action="prev-version" data-id="${message.id}" title="上个版本" aria-label="上个版本">‹</button>
    <span>${(message.current || 0) + 1}/${message.versions.length}</span>
    <button data-action="next-version" data-id="${message.id}" title="下个版本" aria-label="下个版本">›</button>
  ` : "";
  const repairTool = message.agentCheckFailed ? `<button data-action="continue-repair" data-id="${message.id}" title="继续修复" aria-label="继续修复">⟳</button>` : "";
  return `
    <div class="msg-tools">
      ${versionTools}
      ${repairTool}
      <button data-action="reroll-ai" data-id="${message.id}" title="重生成" aria-label="重生成">↻</button>
      <button data-action="rollback" data-id="${message.id}" title="回溯" aria-label="回溯">↩</button>
    </div>
  `;
}

function renderReasoning(message) {
  if (!message.reasoning) return "";
  return `
    <details class="reasoning-block">
      <summary>\u6b63\u5728\u601d\u8003</summary>
      <div>${escapeHtml(message.reasoning)}</div>
    </details>
  `;
}

function renderActivity(message) {
  const details = Array.isArray(message.details) ? message.details : [];
  const body = details.length
    ? `<div class="activity-details">${details.map((item) => `<pre>${escapeHtml(item)}</pre>`).join("")}</div>`
    : "";
  return `
    <article class="msg ai reveal activity-msg" data-id="${message.id}">
      <div class="activity-line">
        <span class="activity-icon">&gt;_</span>
        <details ${message.open ? "open" : ""}>
          <summary>${escapeHtml(message.title || "Thinking")}</summary>
          ${body}
        </details>
      </div>
    </article>
  `;
}

function updatePendingMessageDom(message) {
  const node = messagesEl.querySelector(`[data-id="${message.id}"]`);
  if (!node) return false;
  if (message.kind === "activity") {
    const summary = node.querySelector(".activity-line summary");
    const details = node.querySelector(".activity-details");
    if (summary) summary.textContent = message.title || "Thinking";
    if (details) {
      const list = Array.isArray(message.details) ? message.details : [];
      details.innerHTML = list.map((item) => `<pre>${escapeHtml(item)}</pre>`).join("");
    }
    return true;
  }
  const bubbleText = node.querySelector(".bubble-text");
  if (bubbleText) {
    bubbleText.textContent = currentText(message);
    return true;
  }
  return false;
}

function renderSentImage(file) {
  return `
    <button class="sent-image" data-action="preview-image" data-src="${escapeHtml(file.dataUrl)}" data-name="${escapeHtml(file.name)}">
      <img src="${file.dataUrl}" alt="">
      <span>${escapeHtml(file.name)}</span>
    </button>
  `;
}

function renderSentFile(file) {
  return `
    <div class="sent-file">
      <span class="attachment-icon">文</span>
      <span>
        <strong>${escapeHtml(file.name)}</strong>
        <small>${escapeHtml(formatBytes(file.size))}</small>
      </span>
    </div>
  `;
}

function renderMessageAttachments(message) {
  if (!message.attachments?.length) return "";
  return `
    <div class="message-attachments">
      ${message.attachments.map((file) => file.type === "image" ? renderSentImage(file) : renderSentFile(file)).join("")}
    </div>
  `;
}

function codeLineStats(message) {
  const code = currentText(message);
  const lines = code ? code.split(/\r?\n/).filter((line) => line.trim()).length : 0;
  const previous = message.versions?.length > 1 ? message.versions[Math.max(0, (Number(message.current) || 0) - 1)] || "" : "";
  const previousLines = previous ? previous.split(/\r?\n/).filter((line) => line.trim()).length : 0;
  return {
    added: Math.max(lines - previousLines, lines),
    removed: Math.max(previousLines - lines, 0),
    total: lines,
  };
}

function fileKindLabel(filename = "") {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map = {
    md: "Document · MD",
    html: "Page · HTML",
    css: "Style · CSS",
    js: "Code · JS",
    mjs: "Code · JS",
    cjs: "Code · JS",
    ts: "Code · TS",
    json: "Data · JSON",
    py: "Code · PY",
    txt: "Text · TXT",
  };
  return map[ext] || `File · ${ext ? ext.toUpperCase() : "TXT"}`;
}

function renderComplexCodeCard(message) {
  const code = currentText(message);
  const stats = codeLineStats(message);
  const filename = message.filename || "code.txt";
  const preview = code.split(/\r?\n/).slice(0, 16).join("\n");
  const openClass = ui.activeToolsId === message.id ? "tools-open" : "";
  return `
    <article class="msg ai reveal complex-code-msg ${openClass}" data-id="${message.id}">
      <div class="avatar">${avatarHtml(message.role)}</div>
      ${renderReasoning(message)}
      <div class="complex-file-card">
        ${messageTools(message)}
        <div class="file-card-icon">F</div>
        <div class="file-card-main">
          <strong>${escapeHtml(filename)}</strong>
          <span>${escapeHtml(fileKindLabel(filename))}</span>
          <em><b>+${stats.added}</b> <i>-${stats.removed}</i> · ${escapeHtml(formatBytes(new Blob([code]).size))}</em>
        </div>
        <div class="file-card-actions">
          <button data-action="open-artifact" data-id="${message.id}">Open</button>
          <button data-action="review-code" data-id="${message.id}">Review</button>
        </div>
        <pre class="code-hover-preview"><code>${escapeHtml(preview)}</code></pre>
      </div>
    </article>
  `;
}

function renderCodeChangeSummary(group) {
  const totals = group.reduce((acc, message) => {
    const stats = codeLineStats(message);
    acc.added += stats.added;
    acc.removed += stats.removed;
    return acc;
  }, { added: 0, removed: 0 });
  return `
    <article class="msg ai reveal complex-summary-msg">
      <div class="avatar">${avatarHtml("assistant")}</div>
      <div class="complex-change-card">
        <div class="change-card-head">
          <span class="file-card-icon">±</span>
          <div>
            <strong>Edited ${group.length} files</strong>
            <em><b>+${totals.added}</b> <i>-${totals.removed}</i></em>
          </div>
          <button data-action="open-artifact" data-id="${group[0].id}">Review</button>
        </div>
        <div class="change-file-list">
          ${group.map((message) => {
            const stats = codeLineStats(message);
            return `
              <button data-action="review-code" data-id="${message.id}">
                <span>${escapeHtml(message.filename || "code.txt")}</span>
                <em><b>+${stats.added}</b> <i>-${stats.removed}</i></em>
              </button>
            `;
          }).join("")}
        </div>
      </div>
    </article>
  `;
}

function renderMessage(message) {
  const roleClass = message.role === "user" ? "user" : "ai";
  const attachmentClass = message.attachments?.length ? "has-attachments" : "";
  const toolsOpenClass = ui.activeToolsId === message.id ? "tools-open" : "";
  const avatar = `<div class="avatar">${avatarHtml(message.role)}</div>`;
  const tools = messageTools(message);

  if (ui.editingId === message.id) {
    return `
      <article class="msg ${roleClass} reveal ${toolsOpenClass}" data-id="${message.id}">
        ${avatar}
        <div class="bubble edit-bubble">
          <textarea data-edit-input="${message.id}">${escapeHtml(message.text)}</textarea>
          <div class="edit-actions">
            <button data-action="cancel-edit" data-id="${message.id}">取消</button>
            <button data-action="save-edit" data-id="${message.id}">保存并重发</button>
          </div>
        </div>
      </article>
    `;
  }

  if (message.kind === "artifact") {
    return `
      <article class="msg ${roleClass} reveal ${toolsOpenClass}" data-id="${message.id}">
        ${avatar}
        ${renderReasoning(message)}
        <div class="bubble artifact">
          ${tools}
          <div class="artifact-head">
            <strong>${escapeHtml(message.title)}</strong>
            <span class="code-actions">
              <button data-action="open-artifact" data-id="${message.id}">查看</button>
              <button data-action="download-docx" data-id="${message.id}">DOCX</button>
            </span>
          </div>
          <div class="artifact-body">${escapeHtml(message.text)}</div>
        </div>
      </article>
    `;
  }

  if (message.kind === "activity") {
    return renderActivity(message);
  }

  if (message.kind === "code") {
    if (data.settings.workMode === "complex") {
      return renderComplexCodeCard(message);
    }
    const code = currentText(message);
    return `
      <article class="msg ${roleClass} reveal ${toolsOpenClass}" data-id="${message.id}">
        ${avatar}
        ${renderReasoning(message)}
        <div class="bubble code-card">
          ${tools}
          <div class="codebar">
            <span>${escapeHtml(message.filename || "code.txt")}</span>
            <span class="code-actions">
              <button class="copy-code" data-action="copy-code" data-id="${message.id}">复制</button>
              <button data-action="download-code" data-id="${message.id}">下载</button>
              <button data-action="download-docx" data-id="${message.id}">DOCX</button>
            </span>
          </div>
          <details class="code-fold">
            <summary>${escapeHtml(formatBytes(new Blob([code]).size))} · 展开查看代码</summary>
            <pre><code>${escapeHtml(code)}</code></pre>
          </details>
        </div>
      </article>
    `;
  }

  return `
    <article class="msg ${roleClass} ${attachmentClass} reveal ${toolsOpenClass}" data-id="${message.id}">
      ${avatar}
      ${message.attachments?.length ? `
      <div class="message-stack">
        ${tools}
        ${renderReasoning(message)}
        ${renderMessageAttachments(message)}
        ${currentText(message) ? `<div class="bubble"><span class="bubble-text">${escapeHtml(currentText(message))}</span></div>` : ""}
      </div>
      ` : `
      <div class="message-stack">
        ${tools}
        ${renderReasoning(message)}
        ${currentText(message) ? `<div class="bubble"><span class="bubble-text">${escapeHtml(currentText(message))}</span></div>` : ""}
      </div>
      `}
    </article>
  `;
}

function renderMessages({ keepScroll = false } = {}) {
  const shouldStick = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
  const session = activeSession();
  session.messages = session.messages.map(cleanLegacyMessage);
  if (!session.manualTitle && session.messages.some((message) => message.role === "assistant" && !message.pending && currentText(message).trim())) {
    const nextTitle = generateSessionTitle();
    if (nextTitle && nextTitle !== "新的会话" && session.title !== nextTitle) {
      session.title = nextTitle;
    }
  }
  sessionTitle.textContent = session.title || "新的会话";
  const messages = visibleMessages();
  const rendered = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (data.settings.workMode === "complex" && message.kind === "code" && message.role !== "user") {
      const group = [];
      while (messages[index]?.kind === "code" && messages[index]?.role !== "user") {
        group.push(messages[index]);
        index += 1;
      }
      index -= 1;
      if (group.length > 1) rendered.push(renderCodeChangeSummary(group));
      rendered.push(...group.map(renderMessage));
      continue;
    }
    rendered.push(renderMessage(message));
  }
  messagesEl.innerHTML = rendered.join("");
  if (visibleMessages.restored) saveData();
  renderSummaryProgress();
  renderDrawer();
  if (!keepScroll || shouldStick) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function currentRoundCount() {
  return activeMessages().filter((message) => message.role === "user").length;
}

function generateSessionTitle() {
  const session = activeSession();
  const firstUser = session.messages.find((message) => message.role === "user");
  const firstAi = session.messages.find((message) => message.role === "assistant" && !message.pending && currentText(message).trim());
  const source = [firstAi ? currentText(firstAi) : "", firstUser?.text].filter(Boolean).join(" ");
  const clean = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/产物卡片\s*[:：]/g, " ")
    .replace(/[`#*_>\-—]+/g, "")
    .replace(/^(\u4f60\u597d|\u6536\u5230|\u597d\u7684|\u53ef\u4ee5|\u6211\u5728|\u8fd9\u5c31|\u6211\u4f1a|\u63a5\u4e0b\u6765)[\uFF0C,\s]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "新的会话";
  const phrase = clean.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,18}/g)?.slice(0, 3).join("") || clean;
  return phrase.slice(0, 16);
}

function updateSessionTitleIfNeeded() {
  const session = activeSession();
  if (!session.manualTitle) {
    session.title = generateSessionTitle();
    renderSessions();
    sessionTitle.textContent = session.title;
  }
}

function currentSummaryRoundCount() {
  return Math.max(0, currentRoundCount() - (Number(activeSession().lastSummarizedTurn) || 0));
}

function renderSummaryProgress() {
  const total = Math.max(1, Number(data.settings.summaryEvery) || 30);
  const current = Math.min(total, currentSummaryRoundCount());
  const percent = Math.min(100, Math.round((current / total) * 100));
  const estimatedTokens = estimateSessionTokens();
  summaryProgressFill.style.width = `${percent}%`;
  const tip = `自动总结进度：${current}/${total} · 估算 ${estimatedTokens} tokens`;
  summaryProgress.dataset.tip = tip;
  summaryProgress.title = tip;
  summaryProgressTip.textContent = tip;
  summaryEveryInput.value = total;
  summaryEveryLabel.textContent = String(total);
  sharedMemoryToggle.checked = Boolean(data.settings.sharedMemory);
  projectMemoryCount.textContent = String(activeProject().memory?.length || 0);
  globalMemoryState.textContent = data.settings.sharedMemory ? "开启" : "关闭";
  renderMemoryPanels();
}

function defaultWorkPlan() {
  return {
    current: 0,
    total: 4,
    state: "等待工坊任务",
    steps: [
      { title: "理解需求与约束", status: "pending", detail: "等待用户发送工坊任务后开始。" },
      { title: "制定可执行计划", status: "pending", detail: "确认要生成或修改哪些内容。" },
      { title: "生成或修改产物", status: "pending", detail: "输出文件卡片、产物卡片或写入本地 Agent 项目。" },
      { title: "真实检查与修正", status: "pending", detail: "连接 Agent 后执行可用检查命令；未连接时明确说明无法真实运行。" },
    ],
  };
}

function renderWorkSurface() {
  const mode = data.settings.workMode || "simple";
  body.classList.toggle("complex-mode", mode === "complex");
  if (!workSteps || !workStepLabel || !workStepState || !workStepList) return;
  if (mode !== "complex") {
    workSteps.classList.remove("visible");
    workStepLabel.textContent = "step 0/0";
    workStepState.textContent = "简易工作台";
    workStepList.innerHTML = "";
    return;
  }
  const plan = activeSession().workPlan || defaultWorkPlan();
  const total = Number(plan.total) || plan.steps?.length || 0;
  const current = Math.min(total, Number(plan.current) || 0);
  workSteps.classList.add("visible");
  workStepLabel.textContent = `step ${current}/${total}`;
  workStepState.textContent = plan.state || (current ? "进行中" : "等待工坊任务");
  workStepList.innerHTML = (plan.steps?.length ? plan.steps : defaultWorkPlan().steps).map((step, index) => `
    <li class="${escapeHtml(step.status || (index < current ? "done" : "pending"))}">
      <strong>${escapeHtml(step.title || `步骤 ${index + 1}`)}</strong>
      <span>${escapeHtml(step.detail || "")}</span>
    </li>
  `).join("");
}

function showToast(title, body = "", type = "info") {
  if (!toastStack) return;
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.innerHTML = `<strong>${escapeHtml(title)}</strong>${body ? `<span>${escapeHtml(body)}</span>` : ""}`;
  toastStack.appendChild(item);
  window.setTimeout(() => item.classList.add("show"), 20);
  window.setTimeout(() => {
    item.classList.remove("show");
    window.setTimeout(() => item.remove(), 260);
  }, 2600);
}

function showActionToast(title, body, actions = []) {
  if (!toastStack) return;
  const item = document.createElement("div");
  item.className = "toast action";
  item.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    ${body ? `<span>${escapeHtml(body)}</span>` : ""}
    <div class="toast-actions">
      ${actions.map((action, index) => `<button data-toast-action="${index}">${escapeHtml(action.label)}</button>`).join("")}
    </div>
  `;
  item.addEventListener("click", (event) => {
    const button = event.target.closest("[data-toast-action]");
    if (!button) return;
    const action = actions[Number(button.dataset.toastAction)];
    item.classList.remove("show");
    window.setTimeout(() => item.remove(), 180);
    action?.onClick?.();
  });
  toastStack.appendChild(item);
  window.setTimeout(() => item.classList.add("show"), 20);
  window.setTimeout(() => {
    item.classList.remove("show");
    window.setTimeout(() => item.remove(), 260);
  }, 8000);
}

function renderMemoryPanels() {
  if (userMemoryList) {
    userMemoryList.innerHTML = data.settings.userMemory.length
      ? data.settings.userMemory.map((item, index) => `
        <div class="memory-item">
          <span>${escapeHtml(item)}</span>
          <button data-remove-user-memory="${index}">删除</button>
        </div>
      `).join("")
      : `<div class="memory-item muted">暂无手动记忆</div>`;
  }
  if (summaryRecordsList) {
    const records = activeSession().summaryRecords || [];
    summaryRecordsList.innerHTML = records.length
      ? records.slice().reverse().map((record) => `
        <details class="summary-record">
          <summary>${escapeHtml(record.time)} · ${record.count || 0} 条消息</summary>
          <pre>${escapeHtml(record.text)}</pre>
        </details>
      `).join("")
      : `<div class="memory-item muted">暂无自动总结</div>`;
  }
}

function estimateSessionTokens() {
  const text = activeMessages().filter((message) => !message.archived).map((message) => {
    if (message.kind === "artifact") return `${message.title || ""}\n${message.text || ""}`;
    return currentText(message);
  }).join("\n");
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = text.replace(/[\u4e00-\u9fff]/g, "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(0, Math.round(cjk * 1.15 + latin * 1.35));
}

function summarizeMessage(message) {
  const text = message.kind === "artifact"
    ? `${message.title || "产物"}：${message.text || ""}`
    : currentText(message);
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return `${message.role === "user" ? "用户" : "AI"}：${compact.slice(0, 120)}${compact.length > 120 ? "..." : ""}`;
}

function searchableMessageText(message) {
  if (message.kind === "artifact") return `${message.title || ""}\n${message.text || ""}`;
  if (message.kind === "code") return `${message.filename || ""}\n${currentText(message)}`;
  const attachments = (message.attachments || []).map((file) => file.name).join("\n");
  return [currentText(message), attachments].filter(Boolean).join("\n");
}

function renderCommandResults(query = "") {
  if (!commandResults) return;
  const keyword = query.trim().toLowerCase();
  if (!keyword) {
    commandResults.innerHTML = `
      <button data-command-route="settings">API 配置</button>
      <button data-command-route="masks">面具设定</button>
      <button data-command-route="memory">记忆总结</button>
    `;
    return;
  }
  const results = visibleMessages()
    .map((message) => {
      const text = searchableMessageText(message);
      const index = text.toLowerCase().indexOf(keyword);
      if (index < 0) return null;
      const start = Math.max(0, index - 22);
      const snippet = text.slice(start, index + keyword.length + 58).replace(/\s+/g, " ").trim();
      const label = message.role === "user" ? "用户" : message.kind === "code" ? "文件" : message.kind === "artifact" ? "产物" : "AI";
      return { id: message.id, label, snippet };
    })
    .filter(Boolean)
    .slice(0, 12);
  commandResults.innerHTML = results.length
    ? results.map((item) => `
      <button data-command-message="${item.id}">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(item.snippet)}</span>
      </button>
    `).join("")
    : `<div class="command-empty">没有找到相关内容</div>`;
}

function openCommandPalette() {
  command?.classList.add("open");
  renderCommandResults(commandSearchInput?.value || "");
  window.setTimeout(() => commandSearchInput?.focus(), 20);
}

function closeCommandPalette() {
  command?.classList.remove("open");
}

function jumpToMessage(id) {
  const target = messagesEl.querySelector(`[data-id="${id}"]`);
  if (!target) return;
  closeCommandPalette();
  if (ui.route !== "workspace") showPage("workspace");
  window.setTimeout(() => {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("search-hit");
    window.setTimeout(() => target.classList.remove("search-hit"), 1200);
  }, 80);
}

function bindTap(element, handler) {
  if (!element) return;
  let touchedAt = 0;
  element.addEventListener("pointerup", (event) => {
    if (event.pointerType === "mouse") return;
    touchedAt = Date.now();
    event.preventDefault();
    handler(event);
  });
  element.addEventListener("click", (event) => {
    if (Date.now() - touchedAt < 450) return;
    handler(event);
  });
}

function autoSummarizeIfNeeded({ force = false } = {}) {
  const session = activeSession();
  const total = Math.max(1, Number(data.settings.summaryEvery) || 30);
  if (!force && currentSummaryRoundCount() < total) return { ok: false, skipped: true, reason: "未达到总结轮数" };
  if (!hasUsableApiConfig()) return { ok: false, reason: "未配置完整 API：请先填写接口地址、Key，并选择模型。" };
  const visible = visibleMessages();
  const keepUserTurns = 8;
  let seenUsers = 0;
  let keepFrom = visible.length;
  for (let index = visible.length - 1; index >= 0; index -= 1) {
    if (visible[index].role === "user") seenUsers += 1;
    if (seenUsers >= keepUserTurns) {
      keepFrom = index;
      break;
    }
  }
  const targets = visible.slice(0, Math.max(0, keepFrom));
  if (targets.length < (force ? 2 : 4)) return { ok: false, reason: "可总结内容太少" };
  const summaryText = targets.map(summarizeMessage).filter(Boolean).join("\n");
  if (!summaryText) return { ok: false, reason: "没有可总结文本" };
  const stamp = new Date().toLocaleString("zh-CN", { hour12: false });
  const entry = `[${stamp}] ${summaryText}`;
  session.summary = [session.summary, entry].filter(Boolean).join("\n\n").slice(-6000);
  session.summaryRecords = [
    ...(session.summaryRecords || []),
    { id: uid(), time: stamp, text: summaryText, count: targets.length },
  ].slice(-40);
  targets.forEach((message) => {
    message.archived = true;
  });
  session.lastSummarizedTurn = currentRoundCount();
  const memoryLine = `${session.title || "会话"}：${summaryText.split("\n").slice(0, 3).join("；")}`;
  activeProject().memory = [...(activeProject().memory || []), memoryLine].slice(-30);
  if (data.settings.sharedMemory) {
    data.settings.globalMemory = [...(data.settings.globalMemory || []), memoryLine].slice(-50);
  }
  return { ok: true, count: targets.length };
}

function renderProjects() {
  const workspace = activeWorkspace();
  projectList.innerHTML = workspace.projects.map((project) => `
    <div class="project-pill ${project.id === workspace.activeProjectId ? "active" : ""}" data-id="${project.id}">
      <button class="item-main" data-action="select-project" data-id="${project.id}">
        <strong>${escapeHtml(project.name)}</strong>
        <span>${project.sessions.length} 会话</span>
      </button>
      <span class="item-actions">
        <button data-action="rename-project" data-id="${project.id}" title="重命名">改</button>
        <button data-action="delete-project" data-id="${project.id}" title="删除">×</button>
      </span>
    </div>
  `).join("");
}

function renderSessions() {
  const project = activeProject();
  const workspace = activeWorkspace();
  const sessions = project.sessions;
  sessionList.innerHTML = sessions.length ? sessions.map((session) => {
    const count = Array.isArray(session.messages) ? session.messages.length : 0;
    return `
      <div class="thread ${session.id === workspace.activeSessionId ? "active" : ""}" data-id="${session.id}">
        <button class="item-main" data-action="select-session" data-id="${session.id}">
          <strong>${escapeHtml(session.title || "新的会话")}</strong>
          <span>${count} 条</span>
        </button>
        <span class="item-actions">
          <button data-action="rename-session" data-id="${session.id}" title="重命名">改</button>
          <button data-action="delete-session" data-id="${session.id}" title="删除">×</button>
        </span>
      </div>
    `;
  }).join("") : `<div class="thread"><button class="item-main" disabled><strong>暂无会话</strong><span>点击上方新建</span></button></div>`;
}

function renderTrash() {
  if (!trashList || !trashCount) return;
  const trash = Array.isArray(data.trash) ? data.trash : [];
  data.trash = trash;
  trashCount.textContent = String(trash.length);
  trashList.innerHTML = trash.length
    ? trash.map((item) => `
      <div class="trash-item">
        <span>
          <strong>${escapeHtml(item.name || item.title || "未命名")}</strong>
          <span>${item.mode === "complex" ? "工坊" : "简易"} · ${item.type === "project" ? "项目" : "会话"}</span>
        </span>
        <button data-action="restore-trash" data-id="${item.trashId}">恢复</button>
      </div>
    `).join("")
    : `<div class="trash-item"><span><strong>暂无项目</strong><span>删除的项目和会话会出现在这里</span></span></div>`;
}

function renderWorkspace({ keepScroll = false } = {}) {
  ensureSessionForMode();
  renderProjects();
  renderSessions();
  renderMessages({ keepScroll });
  renderWorkSurface();
  renderTrash();
  renderApiConfigs();
  renderAgentSettings();
  renderPromptSettings();
  restoreComposerDraft();
}

function saveUiState() {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify({
      previewOpen: body.classList.contains("preview-open"),
    }));
  } catch {
    // UI state is best-effort.
  }
}

function setPreviewOpen(open) {
  body.classList.toggle("preview-open", Boolean(open));
  saveUiState();
  if (open) renderDrawer();
}

function restoreUiState() {
  try {
    const state = JSON.parse(localStorage.getItem(UI_STATE_KEY)) || {};
    body.classList.toggle("preview-open", Boolean(state.previewOpen));
  } catch {
    localStorage.removeItem(UI_STATE_KEY);
  }
  if (typeof mobileQuery !== "undefined" && mobileQuery.matches) {
    setPreviewOpen(false);
  }
}

function createProject() {
  const workspace = activeWorkspace();
  const index = workspace.projects.length + 1;
  const mode = data.settings.workMode || "simple";
  const session = {
    id: uid(),
    title: mode === "complex" ? "工坊会话" : "新的会话",
    manualTitle: false,
    mode,
    summary: "",
    lastSummarizedTurn: 0,
    summaryRecords: [],
    workPlan: mode === "complex" ? defaultWorkPlan() : { current: 0, total: 0, state: "", steps: [] },
    messages: [],
  };
  const project = {
    id: uid(),
    name: `${mode === "complex" ? "工坊项目" : "新项目"} ${index}`,
    memory: [],
    sessions: [session],
  };
  workspace.projects.push(project);
  workspace.activeProjectId = project.id;
  workspace.activeSessionId = session.id;
  saveData();
  renderWorkspace();
  if (mobileQuery.matches) body.classList.remove("sidebar-closed");
}

function createSession() {
  const project = activeProject();
  const mode = data.settings.workMode || "simple";
  const workspace = activeWorkspace();
  const sameModeCount = project.sessions.length;
  const session = {
    id: uid(),
    title: mode === "complex" ? `工坊工作 ${sameModeCount + 1}` : `新的会话 ${sameModeCount + 1}`,
    manualTitle: false,
    mode,
    summary: "",
    lastSummarizedTurn: 0,
    summaryRecords: [],
    workPlan: mode === "complex" ? defaultWorkPlan() : { current: 0, total: 0, state: "", steps: [] },
    messages: [],
  };
  project.sessions.unshift(session);
  workspace.activeSessionId = session.id;
  saveData();
  renderWorkspace();
  if (mobileQuery.matches) body.classList.remove("sidebar-closed");
}

function renameProject(id) {
  const project = activeWorkspace().projects.find((item) => item.id === id);
  if (!project) return;
  askConfirm({
    title: "重命名项目",
    body: "输入新的项目名称。",
    okText: "保存",
    inputValue: project.name,
    onConfirm: (value) => {
      if (!value.trim()) return;
      project.name = value.trim();
      saveData();
      renderWorkspace({ keepScroll: true });
    },
  });
}

function renameSession(id) {
  const session = activeProject().sessions.find((item) => item.id === id);
  if (!session) return;
  askConfirm({
    title: "重命名会话",
    body: "输入新的会话名称。",
    okText: "保存",
    inputValue: session.title || "新的会话",
    onConfirm: (value) => {
      if (!value.trim()) return;
      session.title = value.trim();
      session.manualTitle = true;
      saveData();
      renderWorkspace({ keepScroll: true });
    },
  });
}

function deleteProject(id) {
  const workspace = activeWorkspace();
  if (workspace.projects.length <= 1) return;
  const index = workspace.projects.findIndex((project) => project.id === id);
  if (index < 0) return;
  const [project] = workspace.projects.splice(index, 1);
  data.trash.unshift({ type: "project", mode: data.settings.workMode || "simple", trashId: uid(), deletedAt: Date.now(), payload: project, name: project.name });
  if (workspace.activeProjectId === id) {
    workspace.activeProjectId = workspace.projects[0].id;
    workspace.activeSessionId = workspace.projects[0].sessions[0].id;
  }
  saveData();
  renderWorkspace();
}

function deleteSession(id) {
  const project = activeProject();
  if (project.sessions.length <= 1) return;
  const index = project.sessions.findIndex((session) => session.id === id);
  if (index < 0) return;
  const [session] = project.sessions.splice(index, 1);
  data.trash.unshift({
    type: "session",
    mode: data.settings.workMode || "simple",
    trashId: uid(),
    projectId: project.id,
    projectName: project.name,
    deletedAt: Date.now(),
    payload: session,
    title: session.title,
  });
  if (activeWorkspace().activeSessionId === id) activeWorkspace().activeSessionId = project.sessions[0].id;
  saveData();
  renderWorkspace();
}

function restoreTrash(id) {
  data.trash = Array.isArray(data.trash) ? data.trash : [];
  const index = data.trash.findIndex((item) => item.trashId === id);
  if (index < 0) return;
  const [item] = data.trash.splice(index, 1);
  const workspace = activeWorkspace(item.mode || data.settings.workMode || "simple");
  if (item.type === "project") {
    workspace.projects.unshift(item.payload);
    workspace.activeProjectId = item.payload.id;
    workspace.activeSessionId = item.payload.sessions[0]?.id;
  } else {
    const project = workspace.projects.find((candidate) => candidate.id === item.projectId) || workspace.projects[0];
    project.sessions.unshift(item.payload);
    workspace.activeProjectId = project.id;
    workspace.activeSessionId = item.payload.id;
  }
  saveData();
  renderWorkspace();
}

function emptyTrash() {
  data.trash = [];
  saveData();
  renderTrash();
}

function exportBackup() {
  askConfirm({
    title: "导出备份",
    body: "将当前项目、会话、面具、主题、设置和回收站导出为 JSON 文件。",
    okText: "下载备份",
    onConfirm: performBackupExport,
  });
}

async function performBackupExport() {
  const exportData = structuredCopy(data);
  exportData.settings.apiConfigs = exportData.settings.apiConfigs.map((config) => ({
    ...config,
    apiKey: "",
  }));
  const payload = {
    app: "澜台",
    version: 1,
    exportedAt: new Date().toISOString(),
    theme: ui.theme,
    data: exportData,
  };
  const text = JSON.stringify(payload, null, 2);
  backupTextOutput.value = text;
  backupStatusText.textContent = "如果浏览器没有开始下载，可以复制下面的备份内容；导入恢复支持同样的 JSON 内容。";
  const blob = new Blob([text], { type: "application/json" });
  try {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    await triggerDownload(blob, `lantai-backup-${stamp}.json`);
    openModal("backupText");
  } catch (error) {
    backupStatusText.textContent = `下载失败：${error?.message || "浏览器阻止了文件下载"}。可以复制下面的备份内容，保存为 .json 文件后再导入。`;
    openModal("backupText");
  }
}

function importBackupFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    importBackupText(String(reader.result));
  };
  reader.readAsText(file);
}

function importBackupText(text) {
  try {
    const payload = JSON.parse(text);
    const incoming = normalizeData(payload.data || payload);
    askConfirm({
      title: "导入备份",
      body: "导入会覆盖当前本地数据，建议先导出一份当前备份。",
      okText: "导入",
      onConfirm: () => {
        data = incoming;
        if (payload.theme) setTheme(payload.theme);
        saveData();
        renderMasks();
        renderWorkspace();
        document.querySelector('[data-modal="backupPaste"]')?.classList.remove("open");
      },
    });
  } catch {
    askConfirm({
      title: "导入失败",
      body: "备份内容无法读取，请确认是澜台导出的 JSON。",
      okText: "知道",
      onConfirm: () => {},
    });
  }
}

function askConfirm({ title, body, okText = "确认", rejectText = "", inputValue = null, onConfirm, onReject }) {
  confirmTitle.textContent = title;
  confirmBody.textContent = body;
  confirmOk.textContent = okText;
  confirmReject.hidden = !rejectText;
  confirmReject.textContent = rejectText || "拒绝";
  confirmInput.hidden = inputValue === null;
  confirmInput.value = inputValue || "";
  pendingConfirm = onConfirm;
  pendingConfirmReject = onReject || null;
  confirmModal.classList.add("open");
  if (inputValue !== null) {
    window.setTimeout(() => {
      confirmInput.focus();
      confirmInput.select();
    }, 30);
  }
}

function confirmDialog({ title, body, okText = "确认", rejectText = "", inputValue = null }) {
  return new Promise((resolve) => {
    pendingConfirmCancel = () => {
      pendingConfirmCancel = null;
      resolve("dismissed");
    };
    askConfirm({
      title,
      body,
      okText,
      rejectText,
      inputValue,
      onConfirm: (value) => {
        pendingConfirmCancel = null;
        pendingConfirmReject = null;
        resolve(inputValue === null ? "accepted" : value);
      },
      onReject: () => {
        pendingConfirmCancel = null;
        pendingConfirmReject = null;
        resolve("rejected");
      },
    });
  });
}

function cancelConfirm() {
  const cancel = pendingConfirmCancel;
  pendingConfirmCancel = null;
  pendingConfirm = null;
  pendingConfirmReject = null;
  confirmReject.hidden = true;
  confirmInput.hidden = true;
  confirmModal.classList.remove("open");
  cancel?.();
}

function closeConfirm() {
  pendingConfirm = null;
  pendingConfirmCancel = null;
  pendingConfirmReject = null;
  confirmReject.hidden = true;
  confirmInput.hidden = true;
  confirmModal.classList.remove("open");
}

function activeMask() {
  return data.masks[ui.maskKind].find((mask) => mask.id === data.masks.active[ui.maskKind]) || data.masks[ui.maskKind][0];
}

function renderMaskList() {
  maskList.innerHTML = data.masks[ui.maskKind].map((mask) => `
    <button class="mask-item ${mask.id === data.masks.active[ui.maskKind] ? "active" : ""}" data-action="select-mask" data-id="${mask.id}">
      <span class="mask-item-avatar">${avatarMarkup(mask)}</span>
      <span>
        <strong>${escapeHtml(mask.name)}</strong>
        <span>${escapeHtml(mask.injection || mask.rules || mask.profile || mask.system || "未填写设定")}</span>
      </span>
    </button>
  `).join("");
}

function renderMaskEditor() {
  const mask = activeMask();
  maskKindLabel.textContent = ui.maskKind === "ai" ? "AI 面具" : "用户面具";
  maskEditorTitle.textContent = mask.name;
  maskAvatarPreview.innerHTML = avatarMarkup(mask);
  maskNameInput.value = mask.name || "";
  maskShortInput.value = mask.short || "";
  maskSystemInput.value = mask.system || "";
  maskProfileInput.value = mask.profile || "";
  maskInjectionInput.value = mask.injection || "";
  maskDepthInput.value = mask.depth || "core";
  maskRulesInput.value = mask.rules || "";
  maskMcpInput.value = mask.mcp || "";
  document.querySelector('[data-field="system"]').style.display = ui.maskKind === "ai" ? "grid" : "none";
  document.querySelector('[data-field="profile"]').style.display = ui.maskKind === "user" ? "grid" : "none";
  document.querySelectorAll(".ai-only-mask-field").forEach((field) => {
    field.style.display = ui.maskKind === "ai" ? "" : "none";
  });
  renderPromptPreview();
}

function renderMasks() {
  document.querySelectorAll("[data-mask-kind]").forEach((button) => {
    button.classList.toggle("active", button.dataset.maskKind === ui.maskKind);
  });
  renderMaskList();
  renderMaskEditor();
}

function buildMaskPrompt(mask = activeMask(), kind = ui.maskKind) {
  const sections = [];
  sections.push(`# ${kind === "ai" ? "AI 面具" : "用户面具"}：${mask.name || "未命名"}`);
  if (kind === "ai") sections.push(`读取层级：${mask.depth || "core"}`);
  if (kind === "ai" && mask.system) sections.push(`\n[系统设定]\n${mask.system}`);
  if (mask.profile) sections.push(`\n[人设]\n${mask.profile}`);
  if (kind !== "ai") return sections.join("\n");
  if (mask.injection) sections.push(`\n[提示词置入窗口]\n${mask.injection}`);
  if (mask.rules) sections.push(`\n[正则/规则]\n${mask.rules}`);
  if (mask.mcp) sections.push(`\n[MCP 预设]\n${mask.mcp}`);
  return sections.join("\n");
}

function renderPromptPreview() {
  const draft = {
    ...activeMask(),
    system: maskSystemInput.value.trim(),
    profile: maskProfileInput.value.trim(),
    injection: maskInjectionInput.value.trim(),
    depth: maskDepthInput.value,
    rules: maskRulesInput.value.trim(),
    mcp: maskMcpInput.value.trim(),
  };
  maskPromptPreview.textContent = buildMaskPrompt(draft, ui.maskKind);
}

function saveActiveMask() {
  const mask = activeMask();
  mask.name = maskNameInput.value.trim() || (ui.maskKind === "ai" ? "新的 AI 面具" : "新的用户面具");
  mask.short = maskShortInput.value.trim() || mask.name.slice(0, 1);
  mask.system = ui.maskKind === "ai" ? maskSystemInput.value.trim() : "";
  mask.profile = maskProfileInput.value.trim();
  mask.injection = ui.maskKind === "ai" ? maskInjectionInput.value.trim() : "";
  mask.depth = ui.maskKind === "ai" ? maskDepthInput.value : "core";
  mask.rules = ui.maskKind === "ai" ? maskRulesInput.value.trim() : "";
  mask.mcp = ui.maskKind === "ai" ? maskMcpInput.value.trim() : "";
  data.masks.active[ui.maskKind] = mask.id;
  saveData();
  renderMasks();
  renderMessages({ keepScroll: true });
}

function createMask(copyFromCurrent = false) {
  const source = copyFromCurrent ? activeMask() : null;
  const kindName = ui.maskKind === "ai" ? "AI 面具" : "用户面具";
  const mask = {
    id: uid(),
    name: source ? `${source.name} 副本` : `新的${kindName}`,
    short: source?.short || (ui.maskKind === "ai" ? "澜" : "我"),
    avatar: source?.avatar || "",
    system: source?.system || "",
    profile: source?.profile || "",
    injection: source?.injection || "",
    depth: source?.depth || "core",
    rules: source?.rules || "",
    mcp: source?.mcp || "",
  };
  data.masks[ui.maskKind].push(mask);
  data.masks.active[ui.maskKind] = mask.id;
  saveData();
  renderMasks();
  renderMessages({ keepScroll: true });
}

function deleteActiveMask() {
  const list = data.masks[ui.maskKind];
  if (list.length <= 1) return;
  const id = data.masks.active[ui.maskKind];
  data.masks[ui.maskKind] = list.filter((mask) => mask.id !== id);
  data.masks.active[ui.maskKind] = data.masks[ui.maskKind][0].id;
  saveData();
  renderMasks();
  renderMessages({ keepScroll: true });
}

function addAssistantDraft(seed) {
  const clean = seed.trim();
  const ai = getActiveMask("assistant");
  const user = getActiveMask("user");
  const aiPrompt = buildMaskPrompt(ai, "ai");
  const userPrompt = buildMaskPrompt(user, "user");
  const first = clean.length > 36 ? `${ai.short || "澜"}会按当前面具重新整理这条请求。` : "收到，我按这个方向继续。";
  const second = clean.includes("代码") || clean.toLowerCase().includes("html")
    ? "如果输出代码，我会保持完整代码块，并提供复制入口。"
    : `当前会深度读取“${ai.name}”与“${user.name}”。已拼装 ${aiPrompt.length + userPrompt.length} 字面具上下文。`;

  activeMessages().push({
    id: uid(),
    role: "assistant",
    kind: "text",
    versions: [first],
    current: 0,
  });
  activeMessages().push({
    id: uid(),
    role: "assistant",
    kind: "text",
    versions: [second],
    current: 0,
  });
}

function runtimeSystemPrompt() {
  const ai = getActiveMask("assistant");
  const user = getActiveMask("user");
  const projectMemory = (activeProject().memory || []).slice(-8).map((item) => `- ${item}`).join("\n");
  const userMemory = (data.settings.userMemory || []).slice(-20).map((item) => `- ${item}`).join("\n");
  const globalMemory = data.settings.sharedMemory
    ? (data.settings.globalMemory || []).slice(-8).map((item) => `- ${item}`).join("\n")
    : "";
  const sessionSummary = activeSession().summary || "";
  const splitRule = data.settings.humanSplit
    ? "Human split enabled: normal chat should be short, natural Chinese messages. Do not use markdown decoration in casual chat. Keep files, code, markdown documents and tables intact."
    : "Human split disabled: answer in one or a few complete paragraphs instead of many chat bubbles.";
  const modeRule = data.settings.workMode === "complex"
    ? "Complex studio mode: answer ordinary questions directly in natural Chinese. Use project plans, files, checks, logs, repair loops and downloadable artifacts only for real work tasks such as coding, file generation, debugging, project edits or long document production. When project context, validation or operation history is needed, explicitly ask the user to use the right-side Agent buttons: 诊断, 快照, 搜索文件, 运行检查, 审计, or 任务, and explain where to click. Avoid flooding long source code in normal text."
    : "Simple workspace mode: prioritize quick Chinese answers, lightweight files and natural concise communication.";
  const basePrompt = activeBasePrompt();
  return [
    basePrompt,
    splitRule,
    modeRule,
    `[AI 面具]\n${buildMaskPrompt(ai, "ai")}`,
    `[用户面具]\n${buildMaskPrompt(user, "user")}`,
    sessionSummary ? `[当前会话摘要]\n${sessionSummary}` : "",
    projectMemory ? `[项目记忆]\n${projectMemory}` : "",
    userMemory ? `[用户手动记忆]\n${userMemory}` : "",
    globalMemory ? `[全局共享记忆]\n${globalMemory}` : "",
  ].filter(Boolean).join("\n\n");
}

async function apiConversationMessages() {
  const snapshot = await agentProjectSnapshot();
  const history = visibleMessages()
    .filter((message) => !message.pending)
    .slice(-24)
    .map((message) => {
      const role = message.role === "user" ? "user" : "assistant";
      const text = currentText(message);
      if (role === "user" && message.attachments?.some((file) => file.type === "image")) {
        return {
          role,
          content: [
            { type: "text", text: attachmentTextForPrompt(message, text) },
            ...message.attachments
              .filter((file) => file.type === "image")
              .map((file) => ({ type: "image_url", image_url: { url: file.dataUrl } })),
          ],
        };
      }
      return {
        role,
        content: attachmentTextForPrompt(message, text),
      };
    })
    .filter((message) => message.content);
  return [
    { role: "system", content: [runtimeSystemPrompt(), snapshot].filter(Boolean).join("\n\n") },
    ...history,
  ];
}

function attachmentTextForPrompt(message, text) {
  const attachments = message.attachments || [];
  if (!attachments.length) return text;
  const detail = attachments.map((file) => {
    const content = file.text ? `\nContent preview: ${file.text.slice(0, 1200)}` : "";
    return `- ${file.name}: ${file.type === "image" ? "image" : "file"}, ${formatBytes(file.size)}${content}`;
  }).join("\n");
  return `${text || "Please review the attachments."}\n\n[Attachments]\n${detail}`;
}

async function agentProjectSnapshot() {
  if (data.settings.workMode !== "complex" || !data.settings.agent?.enabled) return "";
  try {
    const payload = await agentRequest("/project/snapshot", {
      method: "POST",
      body: JSON.stringify({ path: ".", depth: 2, maxFiles: 36, maxBytes: 12000 }),
    });
    const tree = JSON.stringify(payload.tree || [], null, 2).slice(0, 4000);
    const files = (payload.files || [])
      .slice(0, 18)
      .map((file) => file.text
        ? `File: ${file.path}\n${file.text.slice(0, 1800)}`
        : `File: ${file.path}: ${file.skipped || "no text content"}, ${formatBytes(file.size || 0)}`)
      .join("\n\n---\n\n");
    return [
      "[Agent Project Snapshot]",
      `Workspace: ${payload.path || "."}`,
      `File tree:\n${tree}`,
      files ? `Key files:\n${files}` : "",
    ].filter(Boolean).join("\n\n");
  } catch {
    return "";
  }
}

async function runAgentDiagnose() {
  if (data.settings.workMode !== "complex") {
    showToast("Agent Diagnose", "Switch to studio mode first.", "info");
    return;
  }
  if (!data.settings.agent?.enabled) {
    showToast("Agent Diagnose", "Enable and connect the local Agent first.", "error");
    return;
  }
  try {
    const payload = await agentRequest("/project/diagnose", {
      method: "POST",
      body: JSON.stringify({ path: "." }),
    });
    const info = payload.info || {};
    const checks = (info.recommendedChecks || []).map((item) => `- ${item.label}`).join("\n") || "- No recommended checks detected.";
    const warnings = (payload.warnings || []).map((item) => `- ${item}`).join("\n") || "- No warnings.";
    const tree = JSON.stringify(payload.tree || [], null, 2).slice(0, 2600);
    pushActivity("Agent 诊断完成", [
      `Project: ${payload.path || "."}`,
      `Type: ${info.type || "generic"}`,
      `Package manager: ${info.packageManager || "none"}`,
      `Recommended checks:\n${checks}`,
      `Warnings:\n${warnings}`,
      `File tree:\n${tree}`,
    ]);
    const session = activeSession();
    session.workPlan = {
      ...(session.workPlan || defaultWorkPlan()),
      current: 1,
      state: "Agent diagnose complete",
      steps: (session.workPlan?.steps || defaultWorkPlan().steps).map((step, index) => index === 0
        ? { ...step, status: "done", detail: `${info.type || "generic"} project, ${(info.recommendedChecks || []).length} recommended checks.` }
        : step),
    };
    saveData();
    renderMessages({ keepScroll: true });
    renderWorkSurface();
    renderDrawer();
  } catch (error) {
    showToast("Agent Diagnose failed", error?.message || "Agent request failed.", "error");
  }
}

async function runAgentSnapshot() {
  if (data.settings.workMode !== "complex") {
    showToast("Agent Snapshot", "Switch to studio mode first.", "info");
    return;
  }
  if (!data.settings.agent?.enabled) {
    showToast("Agent Snapshot", "Enable and connect the local Agent first.", "error");
    return;
  }
  try {
    const snapshot = await agentProjectSnapshot();
    if (!snapshot) throw new Error("Snapshot is empty.");
    pushActivity("Agent 快照已捕获", [snapshot.slice(0, 10000)]);
    const session = activeSession();
    session.workPlan = {
      ...(session.workPlan || defaultWorkPlan()),
      current: 1,
      state: "Agent snapshot captured",
      steps: (session.workPlan?.steps || defaultWorkPlan().steps).map((step, index) => index === 0
        ? { ...step, status: "done", detail: "Project tree and key files were loaded into the current studio session." }
        : step),
    };
    saveData();
    renderMessages({ keepScroll: true });
    renderWorkSurface();
  } catch (error) {
    showToast("Agent Snapshot failed", error?.message || "Agent request failed.", "error");
  }
}

async function runAgentProjectChecks() {
  if (data.settings.workMode !== "complex") {
    showToast("Agent Checks", "Switch to studio mode first.", "info");
    return;
  }
  if (!data.settings.agent?.enabled) {
    showToast("Agent Checks", "Enable and connect the local Agent first.", "error");
    return;
  }
  const permission = await requestAgentPermission({
    title: "Run project checks",
    body: "Agent will run the recommended project checks in the configured workspace. This may execute package scripts such as lint, test, build, typecheck, or check.",
    okText: "Run checks",
  });
  if (permission !== "accepted") return;
  try {
    pushActivity("Running project checks", ["Agent is running the recommended project checks."]);
    saveData();
    renderMessages({ keepScroll: true });
    const payload = await agentRequest("/project/run-checks", {
      method: "POST",
      body: JSON.stringify({ path: "." }),
    });
    const results = payload.results || [];
    const detail = results.map((item) => {
      const output = [item.stderr, item.stdout].filter(Boolean).join("\n").trim().slice(0, 900);
      return `${item.ok ? "PASS" : "FAIL"} ${item.label || "check"}${output ? `\n${output}` : ""}`;
    }).join("\n\n");
    pushActivity(`Ran ${results.length} commands`, results.map((item) => {
      const output = [item.stderr, item.stdout].filter(Boolean).join("\n").trim();
      return `${item.ok ? "PASS" : "FAIL"} ${item.label || "check"}${output ? `\n${output}` : ""}`;
    }));
    pushActivity(`Agent 检查${payload.ok ? "通过" : "失败"}`, [
      payload.summary || "",
      detail || "",
    ].filter(Boolean));
    const session = activeSession();
    session.workPlan = {
      ...(session.workPlan || defaultWorkPlan()),
      current: 4,
      state: payload.ok ? "Agent checks passed" : "Agent checks failed",
      steps: (session.workPlan?.steps || defaultWorkPlan().steps).map((step, index) => index === 3
        ? { ...step, status: payload.ok ? "done" : "active", detail: payload.summary || "Project checks completed." }
        : step),
    };
    saveData();
    renderMessages({ keepScroll: true });
    renderWorkSurface();
  } catch (error) {
    showToast("Agent Checks failed", error?.message || "Agent request failed.", "error");
  }
}

async function runAgentTasksList() {
  if (data.settings.workMode !== "complex") {
    showToast("Agent Tasks", "Switch to studio mode first.", "info");
    return;
  }
  if (!data.settings.agent?.enabled) {
    showToast("Agent Tasks", "Enable and connect the local Agent first.", "error");
    return;
  }
  try {
    const payload = await agentRequest("/tasks", { method: "GET" });
    const tasks = payload.tasks || [];
    const text = tasks.length
      ? tasks.map((task) => {
        const output = [task.stderr, task.stdout].filter(Boolean).join("\n").trim().slice(-900);
        return `- ${task.id}: ${task.status}, ${task.command || "cmd"} ${(task.args || []).join(" ")}${output ? `\n${output}` : ""}`;
      }).join("\n\n")
      : "No Agent tasks are currently recorded.";
    pushActivity("Agent 任务列表", [text]);
    saveData();
    renderMessages({ keepScroll: true });
  } catch (error) {
    showToast("Agent Tasks failed", error?.message || "Agent request failed.", "error");
  }
}

async function runAgentAuditSummary() {
  if (data.settings.workMode !== "complex") {
    showToast("Agent 审计", "请先切换到工坊。", "info");
    return;
  }
  if (!data.settings.agent?.enabled) {
    showToast("Agent 审计", "请先启用并连接本地 Agent。", "error");
    return;
  }
  try {
    const payload = await agentRequest("/audit/summary", {
      method: "POST",
      body: JSON.stringify({ limit: 120 }),
    });
    const byType = Object.entries(payload.byType || {})
      .map(([type, count]) => `${type}: ${count}`)
      .join("\n") || "暂无操作记录";
    const files = (payload.changedFiles || []).slice(-12);
    const failed = payload.failed || [];
    pushActivity("Agent audit summary", [
      `total: ${payload.total || 0}`,
      byType,
      files.length ? `changed files:\n${files.join("\n")}` : "changed files: none",
      failed.length ? `failed:\n${failed.map((item) => `${item.time || ""} ${item.type || ""} ${item.status || item.code || ""}`).join("\n")}` : "failed: none",
    ]);
    showToast("审计完成", `最近 ${payload.total || 0} 条记录，变更文件 ${files.length} 个，失败 ${failed.length} 条。`, "success");
    saveData();
    renderMessages({ keepScroll: true });
  } catch (error) {
    showToast("Agent 审计失败", error?.message || "Agent request failed.", "error");
  }
}

async function runAgentFileSearch() {
  if (data.settings.workMode !== "complex") {
    showToast("Agent Search", "Switch to studio mode first.", "info");
    return;
  }
  if (!data.settings.agent?.enabled) {
    showToast("Agent Search", "Enable and connect the local Agent first.", "error");
    return;
  }
  const query = await confirmDialog({
    title: "搜索项目文件",
    body: "输入要在 Agent 工作目录中搜索的关键词。",
    okText: "搜索",
    inputValue: "",
  });
  if (!query || query === "dismissed" || query === "rejected") return;
  const keyword = String(query).trim();
  if (!keyword) return;
  try {
    pushActivity("Searching files", [`query: ${keyword}`]);
    saveData();
    renderMessages({ keepScroll: true });
    const payload = await agentRequest("/files/search", {
      method: "POST",
      body: JSON.stringify({ path: ".", query: keyword, maxResults: 40 }),
    });
    const results = payload.results || [];
    pushActivity(`Found ${results.length} matches`, results.slice(0, 12).map((item) =>
      `${item.path}:${item.line}\n${item.text}`
    ));
    showToast("搜索完成", results.length ? `找到 ${results.length} 处匹配，详情已折叠记录。` : `没有找到“${keyword}”。`, "success");
    saveData();
    renderMessages({ keepScroll: true });
  } catch (error) {
    showToast("Agent Search failed", error?.message || "Agent request failed.", "error");
  }
}

function parseApiReply(payload, endpoint) {
  if (endpoint === "responses") {
    if (payload.output_text) return payload.output_text;
    const text = (payload.output || [])
      .flatMap((item) => item.content || [])
      .map((part) => part.text || part.output_text || "")
      .join("\n")
      .trim();
    if (text) return text;
  }
  return payload.choices?.[0]?.message?.content || payload.choices?.[0]?.text || "";
}

function splitReasoning(text) {
  let content = text || "";
  const reasoning = [];
  content = content.replace(/<think>([\s\S]*?)<\/think>/gi, (_, inner) => {
    reasoning.push(inner.trim());
    return "";
  });
  content = content.replace(/(?:^|\n)(?:思考|推理|思维链|reasoning)\s*[:：]\s*([\s\S]*?)(?=\n{2,}|(?:\n(?:正文|回答|最终|final)\s*[:：])|$)/i, (match, inner) => {
    reasoning.push(inner.trim());
    return match.includes("\n正文") || match.includes("\n回答") || match.includes("\n最终") ? match.replace(inner, "") : "";
  });
  content = content.replace(/^(?:正文|回答|最终|final)\s*[:：]\s*/i, "");
  return {
    reasoning: reasoning.filter(Boolean).join("\n\n"),
    content: content.trim(),
  };
}

async function readChatStream(response, onText) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let reasoningText = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const payload = JSON.parse(data);
        const contentDelta = payload.choices?.[0]?.delta?.content || "";
        const reasoningDelta = payload.choices?.[0]?.delta?.reasoning_content || "";
        if (reasoningDelta) {
          reasoningText += reasoningDelta;
          onText?.(fullText, reasoningText);
        }
        if (contentDelta) {
          fullText += contentDelta;
          onText?.(fullText, reasoningText);
        }
      } catch {
        // Ignore malformed keepalive chunks from intermediary providers.
      }
    }
  }
  return fullText;
}

function filenameForLanguage(language = "") {
  const lang = language.toLowerCase().trim();
  if (/\.[a-z0-9]+$/i.test(lang) && !/\s/.test(lang)) return lang;
  if (["html", "xml"].includes(lang)) return "index.html";
  if (["css", "scss"].includes(lang)) return "styles.css";
  if (["js", "javascript", "ts", "typescript"].includes(lang)) return lang.startsWith("ts") ? "script.ts" : "script.js";
  if (["json"].includes(lang)) return "data.json";
  if (["md", "markdown"].includes(lang)) return "notes.md";
  if (["py", "python"].includes(lang)) return "main.py";
  return "code.txt";
}

function parseFenceInfo(info = "", fallbackIndex = 1) {
  const clean = info.trim();
  const fileMatch = clean.match(/(?:file|filename|path)?\s*[:=]?\s*([^\s`]+\.[a-z0-9]+)/i);
  if (fileMatch) return { filename: fileMatch[1], language: clean.split(/\s+/)[0] || "" };
  const first = clean.split(/\s+/)[0] || "";
  const filename = first.includes(".") ? first : filenameForLanguage(first);
  if (filename === "code.txt" && fallbackIndex > 1) return { filename: `file-${fallbackIndex}.txt`, language: first };
  return { filename, language: first };
}

function filenameFromTextBefore(text, fallbackIndex) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const last = lines.at(-1) || "";
  const match = last.match(/([A-Za-z]:\\[^\s]+|[A-Za-z0-9_\-./\\]+\.[A-Za-z0-9]+)/);
  return match?.[1]?.split(/[\\/]/).pop() || `file-${fallbackIndex}.txt`;
}

function classifyAssistantReply(text) {
  const trimmed = text.trim();
  const artifactMatch = trimmed.match(/^(?:产物卡片|Artifact)\s*[:：]\s*([^\n]+)\n([\s\S]+)/i);
  if (artifactMatch) {
    return {
      kind: "artifact",
      title: artifactMatch[1].trim(),
      text: artifactMatch[2].trim(),
    };
  }
  const fenced = trimmed.match(/^```([\w-]*)\n([\s\S]*?)\n```$/);
  if (fenced) {
    const info = parseFenceInfo(fenced[1] || "");
    return {
      kind: "code",
      filename: info.filename,
      versions: [fenced[2]],
      current: 0,
    };
  }
  if (/^<!doctype html|^<html[\s>]|^<section[\s>]|^<div[\s>]/i.test(trimmed)) {
    return {
      kind: "code",
      filename: "index.html",
      versions: [trimmed],
      current: 0,
    };
  }
  return {
    kind: "text",
    versions: [text],
    current: 0,
  };
}

function splitNaturalText(text) {
  const clean = text.trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length > 1) return paragraphs.slice(0, 8);
  if (clean.length <= 240) return [clean];
  const sentences = clean.match(/[^。！？!?""''\n]+[。！？!?""'']?/g) || [clean];
  const chunks = [];
  let current = "";
  sentences.forEach((sentence) => {
    const next = `${current}${sentence}`.trim();
    if (next.length > 220 && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = next;
    }
  });
  if (current.trim()) chunks.push(current.trim());
  return chunks.slice(0, 8);
}

function cleanChatText(text) {
  const clean = String(text || "")
    .replace(/^\s*(?:-{3,}|—{2,}|_{3,}|\*{3,})\s*$/gm, "")
    .replace(/^\s*(?:python|javascript|typescript|html|css|json|markdown)\s*$/gim, "")
    .replace(/^\s*def\s+hello_world\s*\([^)]*\)\s*:\s*$/gim, "")
    .replace(/^\s*print\(["']Hello,\s*world!["']\)\s*$/gim, "")
    .replace(/\u6587\u4ef6\s*[:\uFF1A]\s*`([^`]+)`/g, "\u6587\u4ef6\uFF1A$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^\s*\d+[.)、]\s+/gm, "")
    .trim();
  return clean;
}

function pushTextParts(parts, text) {
  if (data.settings.humanSplit === false) {
    const clean = String(text || "").trim();
    if (clean) parts.push({ kind: "text", versions: [clean], current: 0 });
    return;
  }
  splitNaturalText(text).forEach((chunk) => {
    const clean = cleanChatText(chunk);
    if (clean) parts.push({ kind: "text", versions: [clean], current: 0 });
  });
}

function pushTextAndArtifacts(parts, text) {
  const source = text || "";
  const pattern = /^\u4ea7\u7269\u5361\u7247\s*[:\uFF1A]\s*([^\n]+)\n([\s\S]*?)(?=^\u4ea7\u7269\u5361\u7247\s*[:\uFF1A]|$(?![\s\S]))/gm;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    pushTextParts(parts, source.slice(cursor, match.index));
    const title = match[1].trim();
    const body = match[2].trim();
    if (title && body) {
      parts.push({ kind: "artifact", title, text: body });
    }
    cursor = match.index + match[0].length;
  }
  pushTextParts(parts, source.slice(cursor));
}

function assistantMessagesFromReply(text) {
  const separated = splitReasoning(text);
  const raw = separated.content.trim();
  if (!raw) return [{ kind: "text", versions: [separated.reasoning ? "" : "\u63a5\u53e3\u8fd4\u56de\u4e3a\u7a7a\u3002"], current: 0, reasoning: separated.reasoning }];
  const whole = classifyAssistantReply(raw);
  if (whole.kind === "code") return [{ ...whole, reasoning: separated.reasoning }];

  const parts = [];
  const fencePattern = /```([\w-]*)\n([\s\S]*?)```/g;
  let cursor = 0;
  let match;
  while ((match = fencePattern.exec(raw)) !== null) {
    const before = raw.slice(cursor, match.index);
    pushTextAndArtifacts(parts, before);
    const info = parseFenceInfo(match[1] || "", parts.filter((item) => item.kind === "code").length + 1);
    const filename = info.filename === "code.txt"
      ? filenameFromTextBefore(before, parts.filter((item) => item.kind === "code").length + 1)
      : info.filename;
    parts.push({
      kind: "code",
      filename,
      versions: [match[2].trim()],
      current: 0,
    });
    cursor = match.index + match[0].length;
  }
  pushTextAndArtifacts(parts, raw.slice(cursor));

  if (parts.length) {
    if (separated.reasoning) parts[0].reasoning = separated.reasoning;
    return parts;
  }
  const messages = splitNaturalText(raw)
    .map((chunk) => cleanChatText(chunk))
    .filter(Boolean)
    .map((chunk) => ({ kind: "text", versions: [chunk], current: 0 }));
  if (messages[0] && separated.reasoning) messages[0].reasoning = separated.reasoning;
  return messages;
}

async function requestAssistantReply(onText) {
  const config = activeApiConfig();
  if (!config?.baseUrl || !config.apiKey || !config.model) {
    return { ok: false, text: "还没有完整 API 配置。请在设置里填写 Base URL、API Key，并选择模型。" };
  }
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const endpoint = config.endpoint || "chat/completions";
  const useStream = endpoint === "chat/completions" && config.stream !== false;
  const conversation = await apiConversationMessages();
  const responseInput = conversation.map((message) => {
    const content = Array.isArray(message.content)
      ? message.content.map((part) => part.text || part.image_url?.url || "").join("\n")
      : message.content;
    return `${message.role}:\n${content}`;
  }).join("\n\n");
  const body = endpoint === "responses"
    ? {
        model: config.model,
        input: responseInput,
      }
    : {
        model: config.model,
        messages: conversation,
        temperature: 0.7,
        stream: useStream,
      };
  try {
    ui.abortController = new AbortController();
    const response = await fetch(`${baseUrl}/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ui.abortController.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const contentType = response.headers.get("content-type") || "";
    if (useStream && contentType.includes("text/event-stream")) {
      const streamed = (await readChatStream(response, onText)).trim();
      return { ok: Boolean(streamed), text: streamed || "接口返回为空。" };
    }
    const payload = await response.json();
    const text = parseApiReply(payload, endpoint).trim();
    return { ok: Boolean(text), text: text || "接口返回为空。" };
  } catch (error) {
    if (error?.name === "AbortError") return { ok: false, text: "" };
    return { ok: false, text: `API 请求失败：${error?.message || "浏览器或中转站拒绝请求"}。` };
  } finally {
    ui.abortController = null;
  }
}

function assignMessageVersion(target, source) {
  target.kind = source.kind || "text";
  target.filename = source.filename;
  target.title = source.title;
  target.text = source.text;
  target.reasoning = source.reasoning || "";
  const nextText = source.versions?.[0] ?? source.text ?? "";
  target.versions = [...(target.versions || []), nextText];
  target.current = target.versions.length - 1;
  target.pending = false;
}

async function completePendingReply(pendingId, { versionTargetId = null } = {}) {
  ui.sending = true;
  sendButton.innerHTML = STOP_ICON;
  sendButton.title = "停止";
  sendButton.setAttribute("aria-label", "停止");
  let lastRenderAt = 0;
  const reply = await requestAssistantReply((partial, reasoning) => {
    const pending = activeMessages().find((message) => message.id === pendingId);
    if (!pending) return;
    pending.versions = [partial || (reasoning ? "" : "\u6b63\u5728\u601d\u8003...")];
    if (pending.kind === "activity") {
      pending.title = partial ? "Writing" : "Thinking";
      pending.details = [partial || reasoning || "Thinking"];
    }
    pending.current = 0;
    pending.reasoning = reasoning || pending.reasoning || "";
    const now = Date.now();
    if (now - lastRenderAt > 120) {
      lastRenderAt = now;
      const updated = updatePendingMessageDom(pending);
      if (!updated) renderMessages({ keepScroll: true });
      else if (messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }
  });
  const pendingIndex = activeMessages().findIndex((message) => message.id === pendingId);
  if (pendingIndex >= 0) {
    const pendingMessage = activeMessages()[pendingIndex];
    const workFlow = pendingMessage.flow === "work" || pendingMessage.kind === "activity";
    const finalText = reply.text || currentText(pendingMessage) || "已停止。";
    const parsed = assistantMessagesFromReply(finalText);
    const generatedFiles = parsed
      .filter((message) => message.kind === "code")
      .map((message, index) => ({
        name: safeFilename(message.filename || `file-${index + 1}.txt`),
        text: message.versions?.[0] || message.text || "",
      }));
    if (workFlow) finishComplexPlanAfterReply(finalText);
    if (versionTargetId) {
      const target = activeMessages().find((message) => message.id === versionTargetId);
      if (target && parsed[0]) assignMessageVersion(target, parsed[0]);
      activeMessages().splice(pendingIndex, 1);
    } else {
      const replacements = parsed.map((message, index) => ({
        id: workFlow ? uid() : (index === 0 ? pendingId : uid()),
        role: "assistant",
        ...message,
        pending: false,
      }));
      if (workFlow) {
        replacements.unshift({
          id: pendingId,
          role: "assistant",
          kind: "activity",
          title: "Writing",
          details: [
            `Parsed ${parsed.length} output block${parsed.length === 1 ? "" : "s"}.`,
            generatedFiles.length ? `Prepared ${generatedFiles.length} downloadable file${generatedFiles.length === 1 ? "" : "s"}.` : "No file block was detected.",
          ],
          open: false,
          pending: false,
        });
      }
      activeMessages().splice(pendingIndex, 1, ...replacements);
    }
    if (workFlow && generatedFiles.length) window.setTimeout(() => runComplexAgentCheck(generatedFiles), 50);
  }
  updateSessionTitleIfNeeded();
  const summaryResult = autoSummarizeIfNeeded();
  if (summaryResult.ok) showToast("自动总结完成", `已折叠 ${summaryResult.count} 条旧消息。`, "success");
  else if (!summaryResult.skipped) showToast("自动总结失败", summaryResult.reason || "未知原因", "error");
  saveData();
  renderMessages();
  ui.sending = false;
  sendButton.innerHTML = SEND_ICON;
  sendButton.title = "发送";
  sendButton.setAttribute("aria-label", "发送");
}

function appendPendingReply({ workRequest = false } = {}) {
  const pendingId = uid();
  const complexWork = data.settings.workMode === "complex" && workRequest;
  activeMessages().push({
    id: pendingId,
    role: "assistant",
    kind: complexWork ? "activity" : "text",
    flow: complexWork ? "work" : "chat",
    title: complexWork ? "Thinking" : undefined,
    details: [],
    versions: ["\u6b63\u5728\u601d\u8003..."],
    current: 0,
    pending: true,
  });
  return pendingId;
}

function pushActivity(title, details = [], { open = false } = {}) {
  activeMessages().push({
    id: uid(),
    role: "assistant",
    kind: "activity",
    title,
    details: Array.isArray(details) ? details : [String(details || "")],
    open,
  });
}

function startComplexPlanFromUser(text, { resetAutoRepair = true } = {}) {
  if (data.settings.workMode !== "complex") return;
  const session = activeSession();
  const clean = text.replace(/\s+/g, " ").trim();
  if (resetAutoRepair) session.autoRepairUsed = false;
  session.workPlan = {
    current: 1,
    total: 4,
    state: "正在理解需求",
    steps: [
      { title: "理解需求与约束", status: "active", detail: clean ? clean.slice(0, 80) : "读取附件与当前会话上下文。" },
      { title: "制定可执行计划", status: "pending", detail: "等待 AI 给出计划步骤并确认执行路径。" },
      { title: "生成或修改产物", status: "pending", detail: "优先输出文件卡片或产物卡片，避免长代码刷屏。" },
      { title: "真实检查与修正", status: "pending", detail: data.settings.agent?.enabled ? "将尝试通过本地 Agent 执行可用检查。" : "未启用 Agent 时必须明确无法真实运行检查。" },
    ],
  };
}

function finishComplexPlanAfterReply(replyText = "") {
  if (data.settings.workMode !== "complex") return;
  const session = activeSession();
  const plan = session.workPlan || defaultWorkPlan();
  const hasFile = /```|产物卡片\s*[:：]/.test(replyText);
  const mentionsCheck = /检查|测试|运行|Agent|node --check|npm test|py_compile/i.test(replyText);
  session.workPlan = {
    ...plan,
    current: mentionsCheck ? 4 : (hasFile ? 3 : Math.max(2, Number(plan.current) || 1)),
    total: Number(plan.total) || 4,
    state: mentionsCheck ? "等待查看检查结果" : (hasFile ? "产物已生成，等待检查" : "计划已生成"),
    steps: (plan.steps || defaultWorkPlan().steps).map((step, index) => {
      if (index === 0) return { ...step, status: "done" };
      if (index === 1) return { ...step, status: hasFile || mentionsCheck ? "done" : "active", detail: "AI 已输出计划或执行说明。" };
      if (index === 2) return { ...step, status: hasFile ? "done" : "pending" };
      if (index === 3) return { ...step, status: mentionsCheck ? "active" : "pending" };
      return step;
    }),
  };
}

function isComplexWorkRequest(text = "", attachments = []) {
  if (data.settings.workMode !== "complex") return false;
  const source = String(text || "").toLowerCase();
  const fileAttachments = (attachments || []).filter((file) => file.type !== "image");
  if (fileAttachments.length) return true;
  if (/(写|改|修|做|生成|创建|实现|实装|继续实装|开发|重构|排错|报错|bug|测试|检查|运行|部署|打包|导出|下载|文件|代码|网页|网站|应用|组件|样式|脚本|接口|后端|前端|数据库|项目|docx|html|css|javascript|typescript|python|json|markdown|api|agent|termux|npm|node)/i.test(source)) {
    return true;
  }
  if (/(build|implement|create|generate|write|edit|fix|debug|test|run|refactor|deploy|package|download|export|file|code|website|app|component|backend|frontend|database|project)/i.test(source)) {
    return true;
  }
  return false;
}

async function sendMessage() {
  const text = composerInput.value.trim();
  if ((!text && !ui.attachments.length) || ui.sending) return;
  const session = activeSession();
  if (!session.messages.length && (!session.title || session.title.startsWith("新的会话"))) {
    session.title = "新的会话";
  }
  const workRequest = isComplexWorkRequest(text, ui.attachments);
  if (workRequest) startComplexPlanFromUser(text || "请查看附件。");
  activeMessages().push({ id: uid(), role: "user", kind: "text", text, attachments: structuredCopy(ui.attachments) });
  const pendingId = appendPendingReply({ workRequest });
  composerInput.value = "";
  clearComposerDraft();
  ui.attachments = [];
  renderAttachmentTray();
  saveData();
  renderWorkspace();
  await completePendingReply(pendingId);
}

function findMessageIndex(id) {
  return activeMessages().findIndex((message) => message.id === id);
}

async function rerollAi(id) {
  const index = findMessageIndex(id);
  if (index < 0 || ui.sending) return;
  const target = activeMessages()[index];
  target.pending = true;
  activeSession().messages = activeMessages().slice(0, index + 1);
  const previousUser = [...activeMessages()].slice(0, index).reverse().find((message) => message.role === "user");
  const pendingId = appendPendingReply({ workRequest: target.flow === "work" || isComplexWorkRequest(previousUser?.text || "", previousUser?.attachments || []) });
  saveData();
  renderMessages({ keepScroll: true });
  await completePendingReply(pendingId, { versionTargetId: target.id });
}

async function rerollFromUser(id) {
  const index = findMessageIndex(id);
  if (index < 0 || ui.sending) return;
  const messages = activeMessages();
  activeSession().messages = messages.slice(0, index + 1);
  const userMessage = activeMessages()[index];
  const pendingId = appendPendingReply({ workRequest: isComplexWorkRequest(userMessage?.text || "", userMessage?.attachments || []) });
  saveData();
  renderMessages();
  await completePendingReply(pendingId);
}

async function continueAgentRepair(id) {
  if (ui.sending) return;
  const message = activeMessages().find((item) => item.id === id);
  if (!message?.agentCheckFailed) return;
  const files = (message.agentCheckFiles || []).join(", ") || "generated files";
  const prompt = [
    "Continue the repair from the failed Agent checks.",
    `Affected files: ${files}`,
    "",
    "Failure log:",
    message.agentCheckDetail || currentText(message),
    "",
    "Use the failure log to identify the root cause, regenerate only the necessary files, and make sure the next answer is suitable for Agent write/check again.",
  ].join("\n");
  activeMessages().push({ id: uid(), role: "user", kind: "text", text: prompt });
  startComplexPlanFromUser(prompt, { resetAutoRepair: false });
  const pendingId = appendPendingReply({ workRequest: true });
  saveData();
  renderWorkspace();
  await completePendingReply(pendingId);
}

function rollbackTo(id) {
  const index = findMessageIndex(id);
  if (index < 0) return;
  activeSession().messages = activeMessages().slice(0, index + 1);
  saveData();
  renderMessages();
}

async function copyCode(id, button) {
  const message = activeMessages().find((item) => item.id === id);
  const code = message ? currentText(message) : "";
  try {
    await navigator.clipboard.writeText(code);
    const oldText = button.textContent;
    button.textContent = "已复制";
    window.setTimeout(() => {
      button.textContent = oldText;
    }, 900);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = code;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    button.textContent = ok ? "已复制" : "复制失败";
  }
}

function mimeForFilename(filename = "") {
  const name = filename.toLowerCase();
  if (name.endsWith(".html")) return "text/html";
  if (name.endsWith(".css")) return "text/css";
  if (name.endsWith(".js")) return "text/javascript";
  if (name.endsWith(".json")) return "application/json";
  if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (name.endsWith(".md")) return "text/markdown";
  return "text/plain";
}

function safeFilename(name = "file") {
  return String(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").slice(0, 120) || "file";
}

function showDownloadError(error) {
  askConfirm({
    title: "下载失败",
    body: `原因：${error?.message || "浏览器阻止了本地文件下载。可以尝试使用右侧产物里的 ZIP 下载，或换用浏览器打开当前 HTML。"}`,
    okText: "知道",
    onConfirm: () => {},
  });
}

function pickerTypesFor(filename, blob) {
  const extMatch = String(filename || "").match(/(\.[a-z0-9]+)$/i);
  const extension = extMatch ? extMatch[1].toLowerCase() : ".txt";
  const mime = blob.type?.split(";")[0] || mimeForFilename(filename);
  return [{ description: "文件", accept: { [mime || "application/octet-stream"]: [extension] } }];
}

async function saveWithPicker(blob, filename) {
  if (!window.showSaveFilePicker || !window.isSecureContext) return false;
  const handle = await window.showSaveFilePicker({
    suggestedName: safeFilename(filename || "download.txt"),
    types: pickerTypesFor(filename, blob),
  });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return true;
}

async function triggerDownload(blob, filename) {
  try {
    if (!(blob instanceof Blob) || blob.size <= 0) throw new Error("文件内容为空");
    if (await saveWithPicker(blob, filename)) return true;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeFilename(filename || "download.txt");
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  } catch (error) {
    if (error?.name === "AbortError") return false;
    showDownloadError(error);
    return false;
  }
}

function flashButton(button, text = "已触发") {
  if (!button) return;
  const oldText = button.textContent;
  button.textContent = text;
  window.setTimeout(() => {
    button.textContent = oldText;
  }, 900);
}

async function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: `${mimeForFilename(filename)};charset=utf-8` });
  return triggerDownload(blob, filename || "file.txt");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function markdownToDocxParagraphs(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  return lines.map((line) => {
    const clean = line.replace(/^#{1,6}\s*/, "").replace(/^[-*]\s+/, "");
    const isHeading = /^#{1,3}\s+/.test(line);
    const style = isHeading ? '<w:pStyle w:val="Heading1"/>' : "";
    return `<w:p><w:pPr>${style}</w:pPr><w:r><w:t xml:space="preserve">${escapeXml(clean || " ")}</w:t></w:r></w:p>`;
  }).join("");
}

function makeDocxBlob(title, text) {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${escapeXml(title || "文档")}</w:t></w:r></w:p>
    ${markdownToDocxParagraphs(text)}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
</w:styles>`;
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  return makeZipBlob([
    { name: "[Content_Types].xml", text: contentTypes },
    { name: "_rels/.rels", text: rels },
    { name: "word/document.xml", text: documentXml },
    { name: "word/_rels/document.xml.rels", text: documentRels },
    { name: "word/styles.xml", text: styles },
  ], "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

async function downloadDocxFromMessage(id) {
  const message = activeMessages().find((item) => item.id === id);
  if (!message) return;
  const base = (message.filename || message.title || activeSession().title || "document").replace(/\.[^.]+$/, "");
  const blob = makeDocxBlob(base, message.kind === "artifact" ? message.text : currentText(message));
  return triggerDownload(blob, `${base}.docx`);
}

async function downloadCode(id) {
  const message = activeMessages().find((item) => item.id === id);
  if (!message) return;
  return downloadTextFile(message.filename || "code.txt", currentText(message));
}

async function downloadAllCode() {
  const files = codeArtifacts();
  if (!files.length) return false;
  if (files.length === 1) return downloadCode(files[0].id);
  return downloadCodeZip();
}

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function zipDateParts(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function makeZipBlob(files, type = "application/zip") {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const { time, day } = zipDateParts();

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    const crc = crc32(data);
    const local = new ArrayBuffer(30 + nameBytes.length);
    const view = new DataView(local);
    writeUint32(view, 0, 0x04034b50);
    writeUint16(view, 4, 20);
    writeUint16(view, 6, 0x0800);
    writeUint16(view, 8, 0);
    writeUint16(view, 10, time);
    writeUint16(view, 12, day);
    writeUint32(view, 14, crc);
    writeUint32(view, 18, data.length);
    writeUint32(view, 22, data.length);
    writeUint16(view, 26, nameBytes.length);
    writeUint16(view, 28, 0);
    new Uint8Array(local, 30).set(nameBytes);
    chunks.push(local, data);

    const header = new ArrayBuffer(46 + nameBytes.length);
    const centralView = new DataView(header);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, time);
    writeUint16(centralView, 14, day);
    writeUint32(centralView, 16, crc);
    writeUint32(centralView, 20, data.length);
    writeUint32(centralView, 24, data.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    new Uint8Array(header, 46).set(nameBytes);
    central.push(header);
    offset += local.byteLength + data.byteLength;
  });

  const centralSize = central.reduce((sum, item) => sum + item.byteLength, 0);
  const end = new ArrayBuffer(22);
  const endView = new DataView(end);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralSize);
  writeUint32(endView, 16, offset);
  writeUint16(endView, 20, 0);
  return new Blob([...chunks, ...central, end], { type });
}

function codeFilesForExport() {
  return codeArtifacts().map((message, index) => ({
    name: safeFilename(message.filename || `file-${index + 1}.txt`),
    text: currentText(message),
  }));
}

async function downloadCodeZip() {
  const files = codeFilesForExport();
  if (!files.length) return;
  const blob = makeZipBlob(files);
  return triggerDownload(blob, `${activeSession().title || "lantai-files"}.zip`);
}

async function agentRequest(path, options = {}) {
  const baseUrl = (data.settings.agent?.baseUrl || "").replace(/\/+$/, "");
  if (!baseUrl) throw new Error("\u672a\u914d\u7f6e Agent \u5730\u5740");
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
  return payload;
}

function agentPreviewUrl(filePath = "") {
  if (!filePath || !data.settings.agent?.enabled) return "";
  const baseUrl = (data.settings.agent?.baseUrl || "").replace(/\/+$/, "");
  if (!baseUrl) return "";
  const encoded = String(filePath).split(/[\\/]+/).map(encodeURIComponent).join("/");
  return `${baseUrl}/preview/${encoded}`;
}

async function requestAgentPermission({ title, body, okText = "\u5141\u8bb8\u6267\u884c" }) {
  const result = await confirmDialog({
    title,
    body,
    okText,
    rejectText: "\u62d2\u7edd",
  });
  if (result === "accepted" || result === true) return "accepted";
  if (result === "rejected") return "rejected";
  return new Promise((resolve) => {
    showActionToast("\u6743\u9650\u5f39\u7a97\u5df2\u5173\u95ed", "\u5982\u679c\u521a\u624d\u662f\u8bef\u89e6\uff0c\u53ef\u4ee5\u91cd\u65b0\u786e\u8ba4\uff1b\u5982\u679c\u4e0d\u60f3\u6267\u884c\uff0c\u53ef\u4ee5\u660e\u786e\u62d2\u7edd\u3002", [
      {
        label: "\u91cd\u65b0\u786e\u8ba4",
        onClick: async () => resolve(await requestAgentPermission({ title, body, okText })),
      },
      {
        label: "\u62d2\u7edd\u6267\u884c",
        onClick: () => resolve("rejected"),
      },
    ]);
  });
}

function checkCommandForFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".js") || name.endsWith(".mjs") || name.endsWith(".cjs")) {
    return { label: `node --check ${file.name}`, command: "node", args: ["--check", file.name] };
  }
  if (name.endsWith(".py")) {
    return { label: `python -m py_compile ${file.name}`, command: "python", args: ["-m", "py_compile", file.name] };
  }
  if (name.endsWith(".json")) {
    return { label: `JSON.parse ${file.name}`, command: "node", args: ["-e", `JSON.parse(require('fs').readFileSync(${JSON.stringify(file.name)}, 'utf8'))`] };
  }
  return null;
}

async function previewAgentFileChanges(dir, files) {
  try {
    const payload = await agentRequest("/files/diff", {
      method: "POST",
      body: JSON.stringify({
        baseDir: dir,
        files: files.map((file) => ({ path: file.name, text: file.text })),
      }),
    });
    const changed = payload.changed || (payload.diffs || []).filter((item) => item.changed);
    if (!changed.length) return "Agent preview: file content is unchanged.";
    const names = changed.slice(0, 8).map((item) => `${item.exists ? "MODIFY" : "ADD"} ${item.path}`).join("\n");
    return `Agent preview: ${changed.length}/${files.length} files will change.\n${names}${changed.length > 8 ? "\n..." : ""}`;
  } catch {
    return "";
  }
}

async function runComplexAgentCheck(files) {
  if (data.settings.workMode !== "complex" || !files.length) return;
  const session = activeSession();
  const plan = session.workPlan || defaultWorkPlan();
  if (!data.settings.agent?.enabled) {
    session.workPlan = {
      ...plan,
      current: 4,
      state: "Agent is not connected; real checks cannot run",
      steps: (plan.steps || defaultWorkPlan().steps).map((step, index) => index === 3
        ? { ...step, status: "active", detail: "Enable and connect the local Agent in settings, then run checks again." }
        : step),
    };
    saveData();
    renderWorkSurface();
    return;
  }

  const dir = `checks/${safeFilename(activeSession().id || uid())}`;
  const checkable = files.map((file) => ({ ...file, check: checkCommandForFile(file) })).filter((file) => file.check);
  if (!checkable.length) {
    session.workPlan = {
      ...plan,
      current: 4,
      state: "No built-in checker for these files",
      steps: (plan.steps || defaultWorkPlan().steps).map((step, index) => index === 3
        ? { ...step, status: "active", detail: "HTML/CSS/Markdown need a project-level check command or browser preview." }
        : step),
    };
    saveData();
    renderWorkSurface();
    return;
  }

  try {
    const changePreview = await previewAgentFileChanges(dir, files);
    const permissionBody = `Agent will write ${files.length} files into ${dir}, then run ${checkable.length} checks. Operations are limited to the configured workspace and will be audited.${changePreview ? `\n\n${changePreview}` : ""}`;
    const permission = await requestAgentPermission({
      title: "Allow Agent write and check",
      body: permissionBody,
      okText: "Allow",
    });
    if (permission !== "accepted") {
      session.workPlan = {
        ...plan,
        current: 4,
        state: "Agent execution rejected",
        steps: (plan.steps || defaultWorkPlan().steps).map((step, index) => index === 3
          ? { ...step, status: "active", detail: "The Agent write/check permission was rejected. Use downloadable files or manual commands instead." }
          : step),
      };
      saveData();
      renderWorkSurface();
      return;
    }

    session.workPlan = {
      ...plan,
      current: 4,
      state: "Agent is writing files and running checks",
      steps: (plan.steps || defaultWorkPlan().steps).map((step, index) => index === 3
        ? { ...step, status: "active", detail: `Writing ${files.length} files and running ${checkable.length} checks.` }
        : step),
    };
    saveData();
    renderWorkSurface();

    pushActivity(`Ran ${checkable.length} commands`, [
      `cwd: ${dir}`,
      ...checkable.map((file) => file.check?.label || file.name),
    ]);
    saveData();
    renderMessages({ keepScroll: true });

    const payload = await agentRequest("/checks/run", {
      method: "POST",
      body: JSON.stringify({
        cwd: dir,
        files: files.map((file) => ({ path: file.name, text: file.text })),
      }),
    });

    (payload.written || []).forEach((written) => {
      const target = activeMessages().find((message) =>
        message.kind === "code"
        && (written.path === message.filename || written.path.endsWith(`/${message.filename}`))
      );
      if (target) target.agentPath = written.path;
    });

    const results = payload.results || [];
    const failed = results.filter((item) => !item.ok);
    const detail = [
      payload.summary || "",
      ...results.map((item) => {
        const output = [item.stderr, item.stdout].filter(Boolean).join("\n").trim().slice(0, 900);
        return `${item.ok ? "PASS" : "FAIL"} ${item.label || "check"}${output ? `\n${output}` : ""}`;
      }),
    ].filter(Boolean).join("\n");
    pushActivity(`Ran ${results.length} commands`, results.map((item) => {
      const output = [item.stderr, item.stdout].filter(Boolean).join("\n").trim();
      return `${item.ok ? "PASS" : "FAIL"} ${item.label || "check"}${output ? `\n${output}` : ""}`;
    }));

    session.workPlan = {
      ...plan,
      current: 4,
      state: failed.length ? "Agent checks failed, waiting for repair" : "Agent checks passed",
      steps: (plan.steps || defaultWorkPlan().steps).map((step, index) => index === 3
        ? { ...step, status: failed.length ? "active" : "done", detail }
        : step),
    };
    const checkMessage = {
      id: uid(),
      role: "assistant",
      kind: "text",
      versions: [failed.length ? `Agent checks found issues:\n${detail}` : `Agent checks passed:\n${detail}`],
      current: 0,
      agentCheckFailed: Boolean(failed.length),
      agentCheckDetail: detail,
      agentCheckFiles: files.map((file) => file.name),
    };
    activeMessages().push(checkMessage);
    saveData();
    renderMessages({ keepScroll: true });
    renderWorkSurface();
    if (failed.length && data.settings.agent?.autoRepairOnce && !session.autoRepairUsed) {
      session.autoRepairUsed = true;
      pushActivity("Auto repair queued", ["Agent checks failed. The studio will ask the model to repair once using the failure log."]);
      saveData();
      renderMessages({ keepScroll: true });
      window.setTimeout(() => continueAgentRepair(checkMessage.id), 120);
    }
  } catch (error) {
    session.workPlan = {
      ...plan,
      current: 4,
      state: "Agent checks failed to run",
      steps: (plan.steps || defaultWorkPlan().steps).map((step, index) => index === 3
        ? { ...step, status: "active", detail: error?.message || "Agent request failed." }
        : step),
    };
    saveData();
    renderWorkSurface();
  }
}

async function saveCodeFolder() {
  const files = codeFilesForExport();
  if (!files.length) return;
  if (!window.showDirectoryPicker) {
    askConfirm({
      title: "浏览器不支持",
      body: "当前浏览器不支持直接保存到文件夹，可以使用下载 ZIP。",
      okText: "下载 ZIP",
      onConfirm: downloadCodeZip,
    });
    return;
  }
  try {
    const directory = await window.showDirectoryPicker({ mode: "readwrite" });
    for (const file of files) {
      const handle = await directory.getFileHandle(file.name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(file.text);
      await writable.close();
    }
  } catch (error) {
    if (error?.name !== "AbortError") {
      askConfirm({
        title: "保存失败",
        body: error?.message || "浏览器没有授予文件夹写入权限。",
        okText: "知道",
        onConfirm: () => {},
      });
    }
  }
}

function openHtmlPreview() {
  const message = latestHtmlCode();
  if (!message) return;
  const previewUrl = agentPreviewUrl(message.agentPath);
  if (previewUrl) {
    window.open(previewUrl, "_blank", "noopener,noreferrer");
    return;
  }
  const blob = new Blob([currentText(message)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function renderAttachmentTray() {
  if (!attachmentTray) return;
  attachmentTray.classList.toggle("has-items", ui.attachments.length > 0);
  attachmentTray.innerHTML = ui.attachments.map((file) => `
    <div class="attachment-chip">
      ${file.type === "image" ? `<img src="${file.dataUrl}" alt="">` : `<span class="attachment-icon">文</span>`}
      <span>
        <strong>${escapeHtml(file.name)}</strong>
        <span>${escapeHtml(formatBytes(file.size))}</span>
      </span>
      <button data-remove-attachment="${file.id}" title="移除">×</button>
    </div>
  `).join("");
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readAsText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve("");
    reader.readAsText(file);
  });
}

function fileFromClipboardItem(item) {
  const file = item.getAsFile();
  if (!file) return null;
  const ext = file.type.split("/")[1] || "png";
  const name = file.name && file.name !== "image.png" ? file.name : `粘贴截图-${Date.now()}.${ext}`;
  return new File([file], name, { type: file.type });
}

async function addFiles(files, typeHint = "file") {
  const selected = Array.from(files || []);
  if (!selected.length) return;
  const items = [];
  for (const file of selected.slice(0, 6)) {
    if (typeHint === "image" || file.type.startsWith("image/")) {
      items.push({
        id: uid(),
        type: "image",
        name: file.name,
        size: file.size,
        mime: file.type,
        dataUrl: await readAsDataUrl(file),
      });
    } else {
      const isText = /^text\//.test(file.type) || /\.(txt|md|json|csv|html|css|js|ts|py)$/i.test(file.name);
      items.push({
        id: uid(),
        type: "file",
        name: file.name,
        size: file.size,
        mime: file.type,
        text: isText && file.size <= 220 * 1024 ? await readAsText(file) : "",
      });
    }
  }
  ui.attachments = [...ui.attachments, ...items].slice(0, 8);
  renderAttachmentTray();
}

function resizeAvatar(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        resolve(canvas.toDataURL("image/webp", 0.86));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

document.addEventListener("pointerdown", (event) => {
  if (!mobileQuery.matches || !ui.activeToolsId) return;
  if (event.target.closest(".msg-tools")) return;
  ui.suppressToolOpenOnce = Boolean(event.target.closest("#messages .msg[data-id]"));
  setActiveMessageTools(null);
}, true);

messagesEl.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (mobileQuery.matches && ui.activeToolsId && !event.target.closest(".msg-tools")) {
    event.stopPropagation();
    setActiveMessageTools(null);
    return;
  }
  if (!button) {
    if (mobileQuery.matches) {
      event.stopPropagation();
      if (event.target.closest(".msg-tools")) return;
      if (ui.suppressToolOpenOnce) {
        ui.suppressToolOpenOnce = false;
        return;
      }
      const messageNode = event.target.closest(".msg[data-id]");
      if (messageNode) {
        setActiveMessageTools(messageNode.dataset.id);
      } else if (ui.activeToolsId) {
        setActiveMessageTools(null);
      }
    }
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const id = button.dataset.id;
  const action = button.dataset.action;
  if (ui.sending && ["reroll-user", "reroll-ai"].includes(action)) {
    flashButton(button, "生成中");
    return;
  }

  if (action === "edit") {
    ui.editingId = id;
    renderMessages({ keepScroll: true });
  }
  if (action === "cancel-edit") {
    ui.editingId = null;
    renderMessages({ keepScroll: true });
  }
  if (action === "save-edit") {
    const input = messagesEl.querySelector(`[data-edit-input="${id}"]`);
    const index = findMessageIndex(id);
    if (index >= 0 && input.value.trim()) {
      const messages = activeMessages();
      messages[index].text = input.value.trim();
      ui.editingId = null;
      activeSession().messages = messages.slice(0, index + 1);
      addAssistantDraft(input.value);
      saveData();
      renderMessages();
    }
  }
  if (action === "reroll-user") rerollFromUser(id);
  if (action === "reroll-ai") rerollAi(id);
  if (action === "continue-repair") continueAgentRepair(id);
  if (action === "prev-version" || action === "next-version") {
    const message = activeMessages().find((item) => item.id === id);
    if (message?.versions?.length) {
      const step = action === "prev-version" ? -1 : 1;
      const current = Number(message.current) || 0;
      message.current = (current + step + message.versions.length) % message.versions.length;
      saveData();
      renderMessages({ keepScroll: true });
    } else {
      flashButton(button, "暂无");
    }
  }
  if (action === "rollback") rollbackTo(id);
  if (action === "copy-code") copyCode(id, button);
  if (action === "download-code" && await downloadCode(id)) flashButton(button, "已保存");
  if (action === "download-docx" && await downloadDocxFromMessage(id)) flashButton(button, "已保存");
  if (action === "preview-image") {
    imagePreview.src = button.dataset.src || "";
    imagePreviewTitle.textContent = button.dataset.name || "图片";
    openModal("imagePreview");
  }
  if (action === "open-artifact" || action === "review-code") {
    ui.drawerView = "artifacts";
    ui.drawerArtifactId = id;
    setPreviewOpen(true);
  }
});

document.addEventListener("click", (event) => {
  if (!mobileQuery.matches || !ui.activeToolsId) return;
  if (event.target.closest(".msg-tools")) return;
  ui.suppressToolOpenOnce = false;
  setActiveMessageTools(null);
});

drawerContent?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  if (button.dataset.action === "drawer-open-artifact") {
    ui.drawerArtifactId = button.dataset.id;
    renderDrawer();
  }
  if (button.dataset.action === "drawer-back") {
    ui.drawerArtifactId = null;
    renderDrawer();
  }
  if (button.dataset.action === "drawer-download-code") {
    if (await downloadCode(button.dataset.id)) flashButton(button, "已保存");
  }
  if (button.dataset.action === "drawer-download-docx") {
    if (await downloadDocxFromMessage(button.dataset.id)) flashButton(button, "已保存");
  }
  if (button.dataset.action === "download-all-code") {
    if (await downloadAllCode()) flashButton(button, "已保存");
  }
  if (button.dataset.action === "download-code-zip") {
    if (await downloadCodeZip()) flashButton(button, "已保存");
  }
  if (button.dataset.action === "save-code-folder") {
    saveCodeFolder();
  }
  if (button.dataset.action === "open-html-preview") {
    openHtmlPreview();
  }
  if (button.dataset.action === "agent-diagnose") {
    runAgentDiagnose();
  }
  if (button.dataset.action === "agent-snapshot") {
    runAgentSnapshot();
  }
  if (button.dataset.action === "agent-search") {
    runAgentFileSearch();
  }
  if (button.dataset.action === "agent-run-checks") {
    runAgentProjectChecks();
  }
  if (button.dataset.action === "agent-audit-summary") {
    runAgentAuditSummary();
  }
  if (button.dataset.action === "agent-tasks") {
    runAgentTasksList();
  }
});

projectList.addEventListener("click", (event) => {
  const actionButton = event.target.closest("button[data-action]");
  if (actionButton?.dataset.action === "rename-project") {
    event.stopPropagation();
    renameProject(actionButton.dataset.id);
    return;
  }
  if (actionButton?.dataset.action === "delete-project") {
    event.stopPropagation();
    const project = activeWorkspace().projects.find((item) => item.id === actionButton.dataset.id);
    askConfirm({
      title: "删除项目",
      body: `确定将“${project?.name || "这个项目"}”移入回收站吗？`,
      okText: "移入回收站",
      onConfirm: () => deleteProject(actionButton.dataset.id),
    });
    return;
  }
  const button = event.target.closest("button[data-action='select-project']");
  if (!button) return;
  activeWorkspace().activeProjectId = button.dataset.id;
  ensureSessionForMode();
  ui.editingId = null;
  saveData();
  renderWorkspace();
}, true);

sessionList.addEventListener("click", (event) => {
  const actionButton = event.target.closest("button[data-action]");
  if (actionButton?.dataset.action === "rename-session") {
    event.stopPropagation();
    renameSession(actionButton.dataset.id);
    return;
  }
  if (actionButton?.dataset.action === "delete-session") {
    event.stopPropagation();
    const session = activeProject().sessions.find((item) => item.id === actionButton.dataset.id);
    askConfirm({
      title: "删除会话",
      body: `确定将“${session?.title || "这个会话"}”移入回收站吗？`,
      okText: "移入回收站",
      onConfirm: () => deleteSession(actionButton.dataset.id),
    });
    return;
  }
  const button = event.target.closest("button[data-action='select-session']");
  if (!button) return;
  activeWorkspace().activeSessionId = button.dataset.id;
  ui.editingId = null;
  saveData();
  renderWorkspace();
}, true);

bindTap(document.querySelector("#newProjectButton"), createProject);
bindTap(document.querySelector("#newSessionButton"), createSession);
summaryEveryInput?.addEventListener("change", () => {
  const value = Math.min(100, Math.max(5, Number(summaryEveryInput.value) || 30));
  data.settings.summaryEvery = value;
  saveData();
  renderSummaryProgress();
});
sharedMemoryToggle?.addEventListener("change", () => {
  data.settings.sharedMemory = sharedMemoryToggle.checked;
  saveData();
  renderSummaryProgress();
  renderDrawer();
});
addUserMemoryButton?.addEventListener("click", () => {
  const text = userMemoryInput.value.trim();
  if (!text) return;
  data.settings.userMemory = [...data.settings.userMemory, text].slice(-80);
  userMemoryInput.value = "";
  saveData();
  renderMemoryPanels();
  showToast("已添加记忆", "AI 后续会读取这条手动记忆。", "success");
});
userMemoryList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-user-memory]");
  if (!button) return;
  data.settings.userMemory.splice(Number(button.dataset.removeUserMemory), 1);
  saveData();
  renderMemoryPanels();
});
toggleSummaryRecordsButton?.addEventListener("click", () => {
  summaryRecordsList.classList.toggle("collapsed");
  toggleSummaryRecordsButton.textContent = summaryRecordsList.classList.contains("collapsed") ? "展开" : "折叠";
});
manualSummaryButton?.addEventListener("click", () => {
  if (!hasUsableApiConfig()) {
    promptApiRequiredForSummary();
    return;
  }
  const changed = autoSummarizeIfNeeded({ force: true });
  saveData();
  renderMessages();
  renderSummaryProgress();
  if (changed.ok) showToast("手动总结完成", `已折叠 ${changed.count} 条旧消息。`, "success");
  else showToast("手动总结失败", changed.reason || "可总结内容太少", "error");
});
trashList?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='restore-trash']");
  if (!button) return;
  data.trash = Array.isArray(data.trash) ? data.trash : [];
  const item = data.trash.find((entry) => entry.trashId === button.dataset.id);
  askConfirm({
    title: "恢复项目",
    body: `确定恢复“${item?.name || item?.title || "这个项目"}”吗？`,
    okText: "恢复",
    onConfirm: () => restoreTrash(button.dataset.id),
  });
});
emptyTrashButton?.addEventListener("click", () => {
  askConfirm({
    title: "清空回收站",
    body: "清空后这些项目和会话将无法从当前页面恢复。",
    okText: "清空",
    onConfirm: emptyTrash,
  });
});
exportBackupButton?.addEventListener("click", exportBackup);
importBackupButton?.addEventListener("click", () => backupFileInput?.click());
backupFileInput?.addEventListener("change", () => {
  const file = backupFileInput.files?.[0];
  if (!file) return;
  importBackupFile(file);
  backupFileInput.value = "";
});
pasteBackupButton?.addEventListener("click", () => {
  backupPasteInput.value = "";
  openModal("backupPaste");
});
importBackupTextButton?.addEventListener("click", () => {
  const text = backupPasteInput.value.trim();
  document.querySelector('[data-modal="backupPaste"]')?.classList.remove("open");
  importBackupText(text);
});
copyBackupText?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(backupTextOutput.value);
    copyBackupText.textContent = "已复制";
    window.setTimeout(() => {
      copyBackupText.textContent = "复制";
    }, 900);
  } catch {
    backupTextOutput.focus();
    backupTextOutput.select();
    document.execCommand("copy");
  }
});

apiConfigList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-api-id]");
  if (!button) return;
  syncApiFormToActive();
  data.settings.activeApiId = button.dataset.apiId;
  saveData();
  renderApiConfigs();
});
newApiConfigButton?.addEventListener("click", createApiConfig);
saveApiConfigButton?.addEventListener("click", () => saveActiveApiConfig());
deleteApiConfigButton?.addEventListener("click", deleteActiveApiConfig);
fetchModelsButton?.addEventListener("click", fetchModels);
apiModelSelect?.addEventListener("change", () => saveActiveApiConfig("已切换模型。"));
apiStreamToggle?.addEventListener("change", () => saveActiveApiConfig(apiStreamToggle.checked ? "已开启流式输出。" : "已关闭流式输出。"));
humanSplitToggle?.addEventListener("change", () => {
  data.settings.humanSplit = humanSplitToggle.checked;
  saveData();
  renderApiConfigs(humanSplitToggle.checked ? "已开启真人分段。" : "已关闭真人分段。");
});
saveAgentButton?.addEventListener("click", () => saveAgentSettings());
agentEnabledToggle?.addEventListener("change", () => saveAgentSettings(agentEnabledToggle.checked ? "\u5df2\u542f\u7528\u672c\u5730 Agent" : "\u5df2\u5173\u95ed\u672c\u5730 Agent"));
agentAutoRepairToggle?.addEventListener("change", () => saveAgentSettings(agentAutoRepairToggle.checked ? "已开启自动修复一次" : "已关闭自动修复"));
agentCheckButton?.addEventListener("click", checkAgentConnection);
agentCopyCommandButton?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(termuxInstallCommand());
    agentCopyCommandButton.textContent = "已复制";
    window.setTimeout(() => {
      agentCopyCommandButton.textContent = "复制 Termux 命令";
    }, 900);
  } catch {
    agentCommandText?.focus();
  }
});
unlockPromptButton?.addEventListener("click", () => {
  if (promptPasswordInput.value !== "04120412") {
    showToast("密码错误", "无法打开内置提示词。", "error");
    return;
  }
  ui.promptUnlocked = true;
  renderPromptSettings();
  showToast("已解锁", "现在可以编辑内置提示词。", "success");
});
saveBasePromptButton?.addEventListener("click", () => {
  if (!ui.promptUnlocked) {
    showToast("未解锁", "请先输入授权码。", "error");
    return;
  }
  data.settings.simplePromptOverride = simplePromptEditor.value.trim();
  data.settings.complexPromptOverride = complexPromptEditor.value.trim();
  saveData();
  showToast("已保存提示词", "两套工作台提示词会在下一次请求中生效。", "success");
});
resetBasePromptButton?.addEventListener("click", () => {
  data.settings.simplePromptOverride = "";
  data.settings.complexPromptOverride = "";
  saveData();
  renderPromptSettings();
  showToast("已恢复默认", "下一次请求会使用默认提示词。", "success");
});

maskList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='select-mask']");
  if (!button) return;
  data.masks.active[ui.maskKind] = button.dataset.id;
  saveData();
  renderMasks();
  renderMessages({ keepScroll: true });
});

document.querySelectorAll("[data-mask-kind]").forEach((button) => {
  button.addEventListener("click", () => {
    ui.maskKind = button.dataset.maskKind;
    renderMasks();
  });
});

document.querySelector("#newMaskButton")?.addEventListener("click", () => createMask(false));
document.querySelector("#duplicateMaskButton")?.addEventListener("click", () => createMask(true));
document.querySelector("#deleteMaskButton")?.addEventListener("click", deleteActiveMask);
document.querySelector("#saveMaskButton")?.addEventListener("click", saveActiveMask);
[
  maskNameInput,
  maskShortInput,
  maskSystemInput,
  maskProfileInput,
  maskInjectionInput,
  maskDepthInput,
  maskRulesInput,
  maskMcpInput,
].forEach((input) => input?.addEventListener("input", renderPromptPreview));

confirmCancel?.addEventListener("click", cancelConfirm);
confirmReject?.addEventListener("click", () => {
  const action = pendingConfirmReject;
  closeConfirm();
  action?.();
});
confirmOk?.addEventListener("click", () => {
  const action = pendingConfirm;
  const value = confirmInput.value;
  closeConfirm();
  action?.(value);
});
confirmInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    confirmOk.click();
  }
});

maskAvatarInput?.addEventListener("change", () => {
  const file = maskAvatarInput.files?.[0];
  if (!file) return;
  resizeAvatar(file).then((avatar) => {
    activeMask().avatar = avatar;
    saveData();
    renderMasks();
    renderMessages({ keepScroll: true });
  });
});

bindTap(sendButton, () => {
  if (ui.sending) {
    ui.abortController?.abort();
    return;
  }
  sendMessage();
});
composerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (ui.sending) return;
    sendMessage();
  }
});
composerInput.addEventListener("input", saveComposerDraft);

function runRouteMask(event, done) {
  if (mobileQuery?.matches && !event?.isTrusted) {
    done();
    return;
  }
  const mask = document.querySelector(".route-mask");
  mask.style.left = `${event?.clientX || window.innerWidth / 2}px`;
  mask.style.top = `${event?.clientY || window.innerHeight / 2}px`;
  mask.classList.remove("run");
  void mask.offsetWidth;
  mask.classList.add("run");
  window.setTimeout(done, 210);
}

const mobileQuery = window.matchMedia("(max-width: 1024px), (pointer: coarse)");
function syncMobileState() {
  body.classList.toggle("is-mobile", mobileQuery.matches);
}
let mobileRecoveryTimer = 0;

function recoverMobileLayout({ redraw = false } = {}) {
  if (!mobileQuery.matches) return;
  window.clearTimeout(mobileRecoveryTimer);
  body.classList.add("mobile-recovering", "is-mobile", "sidebar-closed");
  if (redraw) body.classList.remove("preview-open");
  setActiveMessageTools(null);
  syncViewportHeight();
  mobileRecoveryTimer = window.setTimeout(() => {
    syncViewportHeight();
    if (redraw) renderWorkspace({ keepScroll: true });
    window.requestAnimationFrame(() => body.classList.remove("mobile-recovering"));
  }, 80);
}

syncMobileState();
if (mobileQuery.matches) body.classList.add("sidebar-closed");
mobileQuery.addEventListener?.("change", (event) => {
  syncMobileState();
  if (event.matches) recoverMobileLayout();
  else setActiveMessageTools(null);
});
window.addEventListener("resize", () => {
  syncMobileState();
  recoverMobileLayout();
}, { passive: true });

function showPage(route, event) {
  runRouteMask(event, () => {
    const normalizedRoute = route === "studio" ? "studio" : route;
    if (normalizedRoute === "workspace" || normalizedRoute === "studio") {
      data.settings.workMode = normalizedRoute === "studio" ? "complex" : "simple";
      ensureSessionForMode(data.settings.workMode);
      saveData();
      renderWorkspace();
      restoreComposerDraft();
    } else {
      setPreviewOpen(false);
    }
    ui.route = normalizedRoute;
    document.querySelectorAll(".page").forEach((page) => {
      const pageName = normalizedRoute === "studio" ? "workspace" : normalizedRoute;
      page.classList.toggle("active", page.dataset.page === pageName);
    });
    document.querySelectorAll("[data-route]").forEach((button) => {
      button.classList.toggle("active", button.dataset.route === normalizedRoute);
    });
    if (mobileQuery.matches) body.classList.add("sidebar-closed");
  });
}

document.querySelectorAll("[data-route]").forEach((button) => {
  button.addEventListener("click", (event) => showPage(button.dataset.route, event));
});

bindTap(document.querySelector(".sidebar-toggle"), () => {
  body.classList.toggle("sidebar-closed");
});
document.querySelectorAll(".sidebar-expand, .mobile-sidebar-handle").forEach((button) => {
  bindTap(button, () => {
    body.classList.remove("sidebar-closed");
  });
});

document.querySelectorAll(".preview-toggle").forEach((button) => {
  bindTap(button, () => {
    setPreviewOpen(!body.classList.contains("preview-open"));
  });
});

drawerViewButtons.forEach((button) => {
  bindTap(button, () => {
    ui.drawerView = button.dataset.drawerView;
    ui.drawerArtifactId = null;
    renderDrawer();
  });
});

document.querySelectorAll("[data-settings]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.settings;
    document.querySelectorAll("[data-settings]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    document.querySelectorAll("[data-settings-page]").forEach((page) => {
      page.classList.toggle("active", page.dataset.settingsPage === target);
    });
  });
});

const BACKGROUND_THEMES = new Set(["violet", "vintage", "night"]);
const BACKGROUND_THEME_LABELS = {
  violet: "毛玻璃",
  vintage: "雨夜",
  night: "雨璃",
};

function themeSupportsBackground(theme) {
  return BACKGROUND_THEMES.has(theme);
}

function applyThemeBackground(theme = ui.theme) {
  const raw = data.settings.themeBackgrounds?.[theme] || "";
  const value = raw === "__indexeddb__" ? "" : raw;
  body.classList.toggle("has-custom-bg", Boolean(value));
  body.style.setProperty("--theme-bg-layer", value ? `url("${value}")` : "none");
}

function ensureBackgroundTheme() {
  if (themeSupportsBackground(ui.theme)) return ui.theme;
  setTheme("violet");
  showToast("已切换到毛玻璃", "只有毛玻璃、雨夜和雨璃支持自定义背景。", "info");
  return "violet";
}

function compressThemeBackground(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取图片"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("图片格式无法解析"));
      image.onload = () => {
        const limit = 1800;
        const scale = Math.min(1, limit / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", .84));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function saveThemeBackground(theme, value) {
  data.settings.themeBackgrounds ||= {};
  data.settings.themeBackgrounds[theme] = value;
  saveData();
}

function renderThemeBackgroundPanel() {
  if (!themeBgPanel) return;
  const supported = themeSupportsBackground(ui.theme);
  const label = BACKGROUND_THEME_LABELS[ui.theme] || "当前主题";
  const raw = data.settings.themeBackgrounds?.[ui.theme] || "";
  const value = raw === "__indexeddb__" ? "" : raw;
  themeBgPanel.classList.toggle("disabled", !supported);
  themeBgHint.textContent = supported
    ? `${label}支持自定义背景。上传图片或粘贴 URL 后会作为整页背景，并自动叠加阅读保护。`
    : "当前主题不使用背景皮肤；上传图片时会自动切到毛玻璃并应用。";
  if (themeBgUrl) themeBgUrl.value = value && !value.startsWith("data:") ? value : "";
  if (themeBgPreview) {
    themeBgPreview.classList.toggle("empty", !value);
    themeBgPreview.style.backgroundImage = value ? `url("${value}")` : "";
    themeBgPreview.textContent = value ? "当前背景预览" : "暂无自定义背景";
  }
  if (themeBgUrl) themeBgUrl.disabled = false;
  if (applyThemeBgUrl) applyThemeBgUrl.disabled = false;
  if (resetThemeBg) resetThemeBg.disabled = !supported || !value;
}

function setTheme(theme) {
  body.classList.add("theme-switching");
  ui.theme = theme;
  body.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  applyThemeBackground(theme);
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.classList.toggle("active", button.dataset.themeChoice === theme);
  });
  renderThemeBackgroundPanel();
  window.setTimeout(() => body.classList.remove("theme-switching"), 80);
}

document.querySelectorAll("[data-theme-choice]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.requestAnimationFrame(() => setTheme(button.dataset.themeChoice));
  });
});

themeBgFile?.addEventListener("change", async () => {
  const file = themeBgFile.files?.[0];
  if (!file) return;
  const theme = ensureBackgroundTheme();
  showToast("正在处理背景", "图片会先压缩后保存到本地。", "info");
  try {
    const result = await compressThemeBackground(file);
    saveThemeBackground(theme, result);
    applyThemeBackground(theme);
    renderThemeBackgroundPanel();
    showToast("背景已更新", `${BACKGROUND_THEME_LABELS[theme]}背景图已保存到本地。`, "success");
  } catch (error) {
    showToast("背景读取失败", error.message || "无法读取这张图片，请换一张较小的图片。", "error");
  } finally {
    themeBgFile.value = "";
  }
});

applyThemeBgUrl?.addEventListener("click", () => {
  const value = themeBgUrl.value.trim();
  if (!value) return;
  const theme = ensureBackgroundTheme();
  saveThemeBackground(theme, value);
  applyThemeBackground(theme);
  renderThemeBackgroundPanel();
  showToast("背景已应用", `${BACKGROUND_THEME_LABELS[theme]}背景 URL 已保存。`, "success");
});

resetThemeBg?.addEventListener("click", () => {
  if (!themeSupportsBackground(ui.theme)) return;
  delete data.settings.themeBackgrounds[ui.theme];
  if (themeBgFile) themeBgFile.value = "";
  saveData();
  applyThemeBackground(ui.theme);
  renderThemeBackgroundPanel();
  showToast("已恢复默认", `${BACKGROUND_THEME_LABELS[ui.theme]}已恢复默认背景。`, "success");
});

const plusMenu = document.querySelector(".plus-menu");
if (plusMenu?.parentElement !== document.body) {
  document.body.appendChild(plusMenu);
}
const plusOpenButton = document.querySelector(".plus-open");

function positionPlusMenu() {
  if (!plusMenu || !plusOpenButton) return;
  const rect = plusOpenButton.getBoundingClientRect();
  const width = mobileQuery.matches ? Math.min(180, window.innerWidth - 28) : 142;
  const left = Math.max(10, Math.min(rect.left, window.innerWidth - width - 10));
  const bottom = Math.max(12, window.innerHeight - rect.top + 8);
  plusMenu.style.setProperty("--plus-menu-left", `${left}px`);
  plusMenu.style.setProperty("--plus-menu-bottom", `${bottom}px`);
}

bindTap(plusOpenButton, (event) => {
  event.preventDefault();
  event.stopPropagation();
  positionPlusMenu();
  plusMenu.classList.toggle("open");
});
bindTap(addImageButton, (event) => {
  event.preventDefault();
  event.stopPropagation();
  imageInput?.click();
  plusMenu?.classList.remove("open");
});
bindTap(addFileButton, (event) => {
  event.preventDefault();
  event.stopPropagation();
  fileInput?.click();
  plusMenu?.classList.remove("open");
});
bindTap(quickModelButton, (event) => {
  showPage("settings", event);
  document.querySelector('[data-settings="api"]')?.click();
  plusMenu?.classList.remove("open");
});
window.addEventListener("resize", () => {
  if (plusMenu?.classList.contains("open")) positionPlusMenu();
}, { passive: true });
imageInput?.addEventListener("change", () => {
  addFiles(imageInput.files, "image");
  imageInput.value = "";
});
fileInput?.addEventListener("change", () => {
  addFiles(fileInput.files, "file");
  fileInput.value = "";
});
attachmentTray?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-attachment]");
  if (!button) return;
  ui.attachments = ui.attachments.filter((file) => file.id !== button.dataset.removeAttachment);
  renderAttachmentTray();
});
window.addEventListener("paste", (event) => {
  const files = Array.from(event.clipboardData?.items || [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map(fileFromClipboardItem)
    .filter(Boolean);
  if (!files.length) return;
  event.preventDefault();
  addFiles(files, "image");
});

function openModal(name) {
  document.querySelector(`[data-modal="${name}"]`)?.classList.add("open");
}

document.querySelector(".summary-open")?.addEventListener("click", () => {
  openModal("summary");
});
document.querySelector(".context-open")?.addEventListener("click", () => openModal("context"));

document.querySelectorAll(".modal-close").forEach((button) => {
  button.addEventListener("click", () => {
    const modal = button.closest(".modal-backdrop");
    if (modal === confirmModal) cancelConfirm();
    else modal?.classList.remove("open");
  });
});

document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      if (backdrop === confirmModal) cancelConfirm();
      else backdrop.classList.remove("open");
    }
  });
});

document.querySelector(".command-open")?.addEventListener("click", () => {
  if (command?.classList.contains("open")) closeCommandPalette();
  else openCommandPalette();
});

commandSearchInput?.addEventListener("input", () => renderCommandResults(commandSearchInput.value));
commandResults?.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.commandRoute) {
    closeCommandPalette();
    showPage(button.dataset.commandRoute);
    return;
  }
  if (button.dataset.commandMessage) jumpToMessage(button.dataset.commandMessage);
});

window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (command?.classList.contains("open")) closeCommandPalette();
    else openCommandPalette();
  }
  if (event.key === "Escape") {
    closeCommandPalette();
    plusMenu?.classList.remove("open");
    setPreviewOpen(false);
    document.querySelectorAll(".modal-backdrop.open").forEach((modal) => {
      if (modal === confirmModal) cancelConfirm();
      else modal.classList.remove("open");
    });
    ui.editingId = null;
    renderMessages({ keepScroll: true });
  }
});

const dot = document.querySelector(".cursor-dot");
const ring = document.querySelector(".cursor-ring");
const cursorEnabled = Boolean(dot && ring)
  && window.matchMedia("(pointer: fine)").matches
  && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let ringPos = { ...pointer };
let lastParticleAt = 0;

if (cursorEnabled) {
  body.classList.add("cursor-ready");
  window.addEventListener("pointermove", (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    dot.style.left = `${pointer.x}px`;
    dot.style.top = `${pointer.y}px`;
  });

  function animateCursor() {
    ringPos.x += (pointer.x - ringPos.x) * 0.16;
    ringPos.y += (pointer.y - ringPos.y) * 0.16;
    ring.style.left = `${ringPos.x}px`;
    ring.style.top = `${ringPos.y}px`;
    requestAnimationFrame(animateCursor);
  }
  requestAnimationFrame(animateCursor);

  document.querySelectorAll("button, [data-magnetic], input, textarea, select").forEach((element) => {
    element.addEventListener("pointerenter", () => ring.classList.add("active"));
    element.addEventListener("pointerleave", () => {
      ring.classList.remove("active");
      if (element.dataset.magnetic) element.style.transform = "";
    });
    element.addEventListener("pointermove", (event) => {
      if (!element.dataset.magnetic) return;
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      element.style.transform = `translate(${x * 0.07}px, ${y * 0.07}px)`;
    });
  });
}

document.querySelectorAll(".tilt-card").forEach((card) => {
  card.addEventListener("pointermove", (event) => {
    const rect = card.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const rotateY = (px - 0.5) * 14;
    const rotateX = (0.5 - py) * 11;
    const shadowX = (px - 0.5) * 18;
    const shadowY = 18 + py * 12;
    card.style.setProperty("--shadow-x", shadowX.toFixed(2));
    card.style.setProperty("--shadow-y", shadowY.toFixed(2));
    card.style.transform = `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px)`;
  });
  card.addEventListener("pointerleave", () => {
    card.style.transform = "";
    card.style.removeProperty("--shadow-x");
    card.style.removeProperty("--shadow-y");
  });
});

window.addEventListener("pointerdown", (event) => {
  if (!cursorEnabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const now = performance.now();
  if (now - lastParticleAt < 140) return;
  lastParticleAt = now;
  for (let i = 0; i < 6; i += 1) {
    const particle = document.createElement("span");
    const angle = (Math.PI * 2 * i) / 6;
    const distance = 16 + Math.random() * 22;
    particle.className = "particle";
    particle.style.left = `${event.clientX}px`;
    particle.style.top = `${event.clientY}px`;
    particle.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    document.body.appendChild(particle);
    window.setTimeout(() => particle.remove(), 760);
  }
});

syncViewportHeight();
window.addEventListener("resize", syncViewportHeight, { passive: true });
window.addEventListener("orientationchange", () => window.setTimeout(() => recoverMobileLayout(), 120));
window.addEventListener("online", () => recoverMobileLayout());
window.addEventListener("offline", () => recoverMobileLayout());
window.addEventListener("focus", () => recoverMobileLayout());
window.addEventListener("pageshow", () => recoverMobileLayout());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) window.setTimeout(() => recoverMobileLayout(), 80);
});

setTheme(ui.theme);
restoreUiState();
renderMasks();
renderWorkspace();
restoreIndexedDBState();
