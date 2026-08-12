const STORAGE_KEY = "toothTimer:v1";
const SUPABASE_URL = "https://dtleozvtroankpuviytl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_oRImKCE4ba_xHQgz-Q09cw_NnBrAyi1";
const AUTH_REDIRECT_URL = "https://dubai667.github.io/Brushing-Timer/";

const steps = [
  { id: "upperOuter", title: "上排外侧", duration: 20, hint: "牙刷轻轻打圈，照顾到牙龈边缘。", zone: "M83 113c15-12 38-13 58-4", brush: "translate(0 0)" },
  { id: "upperInner", title: "上排内侧", duration: 20, hint: "牙刷稍微倾斜，慢慢刷到门牙内侧。", zone: "M102 104c18 17 47 17 65 0", brush: "translate(-18 24) rotate(-14deg)" },
  { id: "upperBite", title: "上排咬合面", duration: 15, hint: "前后来回刷，不要漏掉臼齿。", zone: "M86 143c22-8 55-8 78 1", brush: "translate(-4 42) rotate(12deg)" },
  { id: "lowerOuter", title: "下排外侧", duration: 20, hint: "从左到右移动，保持小幅度震动。", zone: "M87 168c24 10 62 10 85-2", brush: "translate(-12 72) rotate(-8deg)" },
  { id: "lowerInner", title: "下排内侧", duration: 20, hint: "竖起牙刷刷前牙内侧，动作轻一点。", zone: "M105 178c18 17 40 17 58 0", brush: "translate(-35 82) rotate(-18deg)" },
  { id: "lowerBite", title: "下排咬合面", duration: 15, hint: "最后刷下排咬合面。", zone: "M92 190c23 12 56 12 80 0", brush: "translate(-5 96) rotate(10deg)" },
  { id: "tongue", title: "舌头表面", duration: 10, hint: "轻刷舌头表面，动作放轻一点。", zone: "M104 158c15 12 40 12 55 0", brush: "translate(-24 70) rotate(-4deg)" },
];

const orderPresets = {
  upperLowerOuterInner: {
    label: "上下外内",
    order: ["upperOuter", "lowerOuter", "upperInner", "lowerInner", "upperBite", "lowerBite", "tongue"],
  },
  lowerUpperOuterInner: {
    label: "下上外内",
    order: ["lowerOuter", "upperOuter", "lowerInner", "upperInner", "lowerBite", "upperBite", "tongue"],
  },
  innerOuterUpperLower: {
    label: "内外上下",
    order: ["upperInner", "lowerInner", "upperOuter", "lowerOuter", "upperBite", "lowerBite", "tongue"],
  },
  innerOuterLowerUpper: {
    label: "内外下上",
    order: ["lowerInner", "upperInner", "lowerOuter", "upperOuter", "lowerBite", "upperBite", "tongue"],
  },
};

const defaultState = {
  brushCount: 2,
  brushMinutes: 2,
  reminderPeriod: getPeriodByHour(new Date().getHours()),
  reminderTimes: {
    morning: "08:00",
    noon: "12:30",
    night: "21:30",
  },
  orderPreset: "upperLowerOuterInner",
  records: [],
};

let state = loadState();
let lastReminderKey = localStorage.getItem("toothTimer:lastReminder") || "";
let timer = {
  running: false,
  done: false,
  startedAt: null,
  elapsed: 0,
  interval: null,
  lastStepIndex: 0,
  lastCountdownKey: "",
};
let audioContext = null;
let supabaseClient = null;
let currentUser = null;
let syncBusy = false;
let otpCooldown = 0;
let otpCooldownTimer = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function getSupabaseClient() {
  if (!window.supabase?.createClient) return null;
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return supabaseClient;
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function playTone(frequency, duration = 0.12, volume = 0.035, delay = 0) {
  const context = getAudioContext();
  if (!context) return;
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playUiSound(type) {
  if (type === "start") {
    playTone(660, 0.1, 0.05);
    playTone(880, 0.11, 0.046, 0.08);
    return;
  }
  if (type === "step") {
    playTone(740, 0.09, 0.044);
    return;
  }
  if (type === "countdown") {
    playTone(520, 0.055, 0.034);
    return;
  }
  if (type === "complete") {
    playTone(620, 0.18, 0.07);
    playTone(780, 0.2, 0.07, 0.14);
    playTone(980, 0.22, 0.065, 0.3);
    playTone(1240, 0.28, 0.06, 0.48);
  }
}

function restartAnimation(element, className) {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function launchConfetti() {
  const container = $("#confettiLayer");
  if (!container) return;
  container.replaceChildren();
  const colors = ["#66bd58", "#a7df70", "#ffd768", "#8fd7ff", "#ff9fb4"];
  Array.from({ length: 54 }).forEach((_, index) => {
    const piece = document.createElement("span");
    const fromLeft = index % 2 === 0;
    const startX = fromLeft ? 12 + Math.random() * 8 : 80 + Math.random() * 8;
    const startY = 84 + Math.random() * 5;
    const riseX = fromLeft ? 80 + Math.random() * 90 : -80 - Math.random() * 90;
    const peakX = fromLeft ? 120 + Math.random() * 180 : -120 - Math.random() * 180;
    const peakY = -330 - Math.random() * 180;
    const fallX = peakX + (fromLeft ? 20 : -20) + (-110 + Math.random() * 220);
    const fallY = peakY + 520 + Math.random() * 260;
    const duration = 3600 + Math.random() * 900;
    piece.style.setProperty("--rise-x", `${riseX}px`);
    piece.style.setProperty("--rise-y", `${peakY * 0.58}px`);
    piece.style.setProperty("--peak-x", `${peakX}px`);
    piece.style.setProperty("--peak-y", `${peakY}px`);
    piece.style.setProperty("--fall-x", `${fallX}px`);
    piece.style.setProperty("--fall-y", `${fallY}px`);
    piece.style.setProperty("--r", `${Math.random() * 760 + 360}deg`);
    piece.style.setProperty("--c", colors[index % colors.length]);
    piece.style.left = `${startX}%`;
    piece.style.top = `${startY}%`;
    piece.style.animationDuration = `${duration}ms`;
    piece.style.animationDelay = `${Math.random() * 220}ms`;
    container.appendChild(piece);
  });
  window.setTimeout(() => container.replaceChildren(), 5200);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return normalizeState({ ...defaultState, ...saved });
  } catch {
    return { ...defaultState };
  }
}

function normalizeState(nextState) {
  const reminderTimes = { ...defaultState.reminderTimes, ...(nextState.reminderTimes || {}) };
  const orderPreset = orderPresets[nextState.orderPreset] ? nextState.orderPreset : defaultState.orderPreset;
  return {
    ...nextState,
    brushCount: [2, 3].includes(Number(nextState.brushCount)) ? Number(nextState.brushCount) : 2,
    brushMinutes: [2, 3].includes(Number(nextState.brushMinutes)) ? Number(nextState.brushMinutes) : 2,
    reminderPeriod: ["morning", "noon", "night"].includes(nextState.reminderPeriod)
      ? nextState.reminderPeriod
      : getPeriodByHour(new Date().getHours()),
    reminderTimes,
    orderPreset,
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getRecordPeriod(record) {
  return record.period || getRecordPeriodLabel(record.time);
}

function recordSignature(record) {
  return [record.date, record.time, record.duration, getRecordPeriod(record)].join("|");
}

function getPeriodByHour(hour) {
  if (hour >= 1 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "noon";
  return "night";
}

function getActivePeriodByHour(hour) {
  const period = getPeriodByHour(hour);
  if (Number(state.brushCount) < 3 && period === "noon") return "night";
  return period;
}

function getPeriodLabel(period = state.reminderPeriod) {
  return { morning: "早间", noon: "午间", night: "晚间" }[period] || "早间";
}

function getRecordPeriodLabel(time = "") {
  const hour = Number(String(time).split(":")[0]);
  const period = getActivePeriodByHour(Number.isFinite(hour) ? hour : new Date().getHours());
  return { morning: "早间", noon: "午间", night: "晚间" }[period] || "早间";
}

function notifyBrushReminder(period) {
  const label = getPeriodLabel(period);
  toast(`${label}刷牙时间到了`);
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("刷牙提醒", {
      body: `${label}刷牙时间到了`,
      icon: "./icon.svg",
    });
  }
}

function checkReminders() {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const sessionDate = sessionDateKey(now);
  Object.entries(state.reminderTimes || {}).forEach(([period, reminderTime]) => {
    if (Number(state.brushCount) < 3 && period === "noon") return;
    if (reminderTime !== currentTime) return;
    const reminderKey = `${sessionDate}:${period}:${reminderTime}`;
    if (reminderKey === lastReminderKey) return;
    lastReminderKey = reminderKey;
    localStorage.setItem("toothTimer:lastReminder", reminderKey);
    notifyBrushReminder(period);
  });
}

function getOrderedSteps() {
  const byId = new Map(steps.map((step) => [step.id, step]));
  return orderPresets[state.orderPreset].order.map((id) => byId.get(id)).filter(Boolean);
}

function getStepDuration(step) {
  if (Number(state.brushMinutes) === 3) {
    if (step.id === "upperBite" || step.id === "lowerBite" || step.id === "tongue") return 20;
    return 30;
  }
  return step.duration;
}

function totalDuration() {
  return Number(state.brushMinutes || 2) * 60;
}

function formatSeconds(value) {
  const safe = Math.max(0, Math.ceil(value));
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const seconds = String(safe % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sessionDateKey(date = new Date()) {
  const sessionDate = new Date(date);
  if (sessionDate.getHours() < 1) sessionDate.setDate(sessionDate.getDate() - 1);
  return todayKey(sessionDate);
}

function renderTodayText() {
  $("#todayText").textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

function getTimerElapsed() {
  if (!timer.running) return timer.elapsed;
  return timer.elapsed + (Date.now() - timer.startedAt) / 1000;
}

function getTimerInfo() {
  const elapsed = Math.min(getTimerElapsed(), totalDuration());
  const orderedSteps = getOrderedSteps();
  let stepStart = 0;
  let stepIndex = orderedSteps.findIndex((step) => {
    const stepEnd = stepStart + getStepDuration(step);
    if (elapsed < stepEnd) return true;
    stepStart = stepEnd;
    return false;
  });
  if (stepIndex < 0) {
    stepIndex = orderedSteps.length - 1;
    stepStart = totalDuration() - getStepDuration(orderedSteps[stepIndex]);
  }
  const stepDuration = getStepDuration(orderedSteps[stepIndex]);
  const stepElapsed = elapsed - stepStart;
  const remaining = totalDuration() - elapsed;
  const stepRemaining = stepDuration - stepElapsed;
  return { elapsed, stepIndex, remaining, stepRemaining };
}

function getProgressArcPath(degrees) {
  if (degrees <= 0.1) return "";
  if (degrees >= 359.9) {
    return "M 140 -50 A 190 190 0 1 1 140 330 A 190 190 0 1 1 140 -50";
  }
  const radians = degrees * (Math.PI / 180);
  const x = 140 + Math.sin(radians) * 190;
  const y = 140 - Math.cos(radians) * 190;
  const largeArc = degrees > 180 ? 1 : 0;
  return `M 140 -50 A 190 190 0 ${largeArc} 1 ${x} ${y}`;
}

function renderTimer() {
  const info = getTimerInfo();
  const orderedSteps = getOrderedSteps();
  const step = orderedSteps[info.stepIndex];
  const progress = totalDuration() ? (info.elapsed / totalDuration()) * 360 : 0;
  const idle = !timer.running && !timer.done && info.elapsed <= 0.1;

  $("#timeLeft").textContent = formatSeconds(info.elapsed);
  $("#stepTimeLeft").textContent = `${getPeriodLabel(getActivePeriodByHour(new Date().getHours()))}打卡`;
  $("#stepIndex").textContent = `第 ${info.stepIndex + 1} / ${orderedSteps.length} 步`;
  $("#stepTitle").textContent = `${step.title} ${Math.round(getStepDuration(step))}s`;
  $("#stepHint").textContent = step.hint;
  const ring = $(".timer-ring");
  $(".timer-value").setAttribute("d", getProgressArcPath(progress));
  ring.classList.toggle("no-progress", progress <= 0.1 && !timer.running);
  if (timer.running && info.stepIndex !== timer.lastStepIndex) {
    timer.lastStepIndex = info.stepIndex;
    timer.lastCountdownKey = "";
    playUiSound("step");
    restartAnimation(ring, "step-pulse");
    restartAnimation($(".timer-copy"), "step-change");
  }
  if (timer.running && info.stepRemaining > 0 && info.stepRemaining <= 3.2) {
    const countdownSecond = Math.ceil(info.stepRemaining);
    const countdownKey = `${info.stepIndex}:${countdownSecond}`;
    if (countdownSecond >= 1 && countdownSecond <= 3 && timer.lastCountdownKey !== countdownKey) {
      timer.lastCountdownKey = countdownKey;
      playUiSound("countdown");
    }
  }
  $("#highlightZone").setAttribute("d", step.zone);
  $("#brushSvg").style.transform = step.brush;
  $("#brushSvg").style.animationPlayState = timer.running ? "running" : "paused";

  if ($("#compactStepText")) $("#compactStepText").textContent = `${step.title}：${step.hint}`;

  $$(".step-dot").forEach((item, index) => {
    item.classList.toggle("active", index === info.stepIndex && !timer.done);
    item.classList.toggle("done", index < info.stepIndex || timer.done);
  });

  if (info.remaining <= 0 && timer.running) completeTimer();
}

function renderSteps() {
  const stepList = $("#stepList");
  if (!stepList) return;
  stepList.innerHTML = getOrderedSteps()
    .map(
      (_step, index) => `<span class="step-dot" aria-label="第 ${index + 1} 步">${index + 1}</span>`,
    )
    .join("");
}

function startTimer() {
  if (timer.done) resetTimer(false);
  if (timer.running) return;
  getAudioContext();
  playUiSound("start");
  timer.running = true;
  timer.startedAt = Date.now();
  timer.lastStepIndex = getTimerInfo().stepIndex;
  timer.lastCountdownKey = "";
  $("#startButton").disabled = true;
  restartAnimation($(".timer-ring"), "start-pulse");
  restartAnimation($("#startButton"), "button-press");
  timer.interval = setInterval(renderTimer, 250);
  renderTimer();
}

function resetTimer(showToast = true) {
  timer.running = false;
  timer.done = false;
  timer.startedAt = null;
  timer.elapsed = 0;
  timer.lastStepIndex = 0;
  timer.lastCountdownKey = "";
  clearInterval(timer.interval);
  $("#startButton").disabled = false;
  $("#startButton span").textContent = "开始刷牙";
  renderTimer();
  if (showToast) toast("已重置");
}

function completeTimer() {
  timer.elapsed = totalDuration();
  timer.running = false;
  timer.done = true;
  clearInterval(timer.interval);
  $("#startButton").disabled = false;
  $("#startButton span").textContent = "再刷一次";
  playUiSound("complete");
  restartAnimation($(".timer-ring"), "complete-pop");
  restartAnimation($(".timer-copy"), "step-change");
  launchConfetti();
  addRecord();
  renderAll();
  toast("刷牙完成");
  if (navigator.vibrate) navigator.vibrate([160, 80, 160]);
}

function addRecord() {
  const now = new Date();
  const record = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    date: sessionDateKey(now),
    time: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(now),
    duration: totalDuration(),
    period: getActivePeriodByHour(now.getHours()),
  };
  state.records.unshift(record);
  state.records = state.records.slice(0, 90);
  saveState();
  syncRecordToCloud(record);
}

function getStreak() {
  const days = new Set((state.records || []).map((record) => record.date));
  let count = 0;
  const cursor = new Date(sessionDateKey());
  while (days.has(todayKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function renderRecords() {
  $("#streakCount").innerHTML = `<span class="stat-value">${getStreak()}</span><span class="stat-unit">天</span>`;
  $("#totalCount").innerHTML = `<span class="stat-value">${(state.records || []).length}</span><span class="stat-unit">次</span>`;
  renderCalendar();
  $("#recordsList").innerHTML = state.records?.length
    ? state.records
        .map(
          (record) => `
            <article class="record-item">
              <div>
                <strong>${record.date}</strong>
              </div>
              <div class="record-meta">
                <span>${record.time}</span>
                <span class="record-period">${getRecordPeriod(record)}</span>
              </div>
            </article>
          `,
        )
        .join("")
    : `<p class="empty">还没有刷牙记录。</p>`;
}

function renderCalendar() {
  const calendar = $("#calendarView");
  if (!calendar) return;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = firstDay.getDay();
  const recordDays = new Set(
    (state.records || [])
      .filter((record) => {
        const [recordYear, recordMonth] = record.date.split("-").map(Number);
        return recordYear === year && recordMonth === month + 1;
      })
      .map((record) => Number(record.date.slice(-2))),
  );
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push(`<span class="calendar-day muted"></span>`);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const done = recordDays.has(day);
    const today = day === now.getDate();
    cells.push(`<span class="calendar-day${done ? " done" : ""}${today ? " today" : ""}">${day}</span>`);
  }
  calendar.innerHTML = `
    <div class="calendar-head">
      <strong>${year}年${month + 1}月</strong>
      <span>完成 ${recordDays.size} 天</span>
    </div>
    <div class="calendar-week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
    <div class="calendar-grid">${cells.join("")}</div>
  `;
}

function renderSettings() {
  $$("input[name='brushCount']").forEach((input) => {
    input.checked = Number(input.value) === Number(state.brushCount);
  });
  $$("input[name='brushDuration']").forEach((input) => {
    input.checked = Number(input.value) === Number(state.brushMinutes);
  });
  $$("input[name='reminderTime']").forEach((input) => {
    input.value = state.reminderTimes?.[input.dataset.period] || "";
    input.closest(".time-select")?.querySelector(".time-value").replaceChildren(input.value);
  });
  $$(".reminder-row[data-period='noon']").forEach((row) => {
    row.hidden = Number(state.brushCount) < 3;
  });
  renderOrderList();
  renderSyncUi();
}

function renderSyncUi() {
  const status = $("#syncStatus");
  const avatar = $("#syncAvatar");
  const nickname = $("#syncNickname");
  const actionText = $("#syncActionText");
  const email = $("#syncEmail");
  const codeButton = $("#syncCodeButton");
  const syncButton = $("#syncNowButton");
  const logoutButton = $("#syncLogoutButton");
  if (!status || !avatar || !nickname || !actionText || !email || !codeButton || !syncButton || !logoutButton) return;
  const signedIn = Boolean(currentUser);
  const userEmail = currentUser?.email || "";
  const name = userEmail ? userEmail.split("@")[0] : "未登录";
  avatar.textContent = signedIn ? name.slice(0, 1).toUpperCase() : "未";
  nickname.textContent = signedIn ? name : "未登录";
  status.textContent = syncBusy ? "同步中" : signedIn ? userEmail : "登录后自动云同步";
  actionText.textContent = signedIn ? "管理" : "去登录";
  email.hidden = signedIn;
  codeButton.hidden = signedIn;
  syncButton.hidden = !signedIn;
  logoutButton.hidden = !signedIn;
  codeButton.textContent = otpCooldown > 0 ? `${otpCooldown}秒后重试` : "查看邮箱登录";
  codeButton.disabled = syncBusy || otpCooldown > 0;
  syncButton.disabled = syncBusy;
  logoutButton.disabled = syncBusy;
}

function setSyncMessage(message = "") {
  const messageEl = $("#syncMessage");
  if (messageEl) messageEl.textContent = message;
}

function openSyncDialog() {
  $("#syncDialog")?.removeAttribute("hidden");
  setSyncMessage(currentUser ? "当前账号已开启云同步。" : "");
}

function closeSyncDialog() {
  $("#syncDialog")?.setAttribute("hidden", "");
}

function startOtpCooldown(seconds = 60) {
  otpCooldown = Math.max(1, Math.ceil(seconds));
  clearInterval(otpCooldownTimer);
  renderSyncUi();
  otpCooldownTimer = window.setInterval(() => {
    otpCooldown = Math.max(0, otpCooldown - 1);
    if (otpCooldown <= 0) clearInterval(otpCooldownTimer);
    renderSyncUi();
  }, 1000);
}

function getOtpCooldownSeconds(message = "") {
  const match = String(message).match(/after\s+(\d+)\s+seconds?/i);
  return match ? Number(match[1]) : 0;
}

function renderOrderList() {
  const orderList = $("#orderList");
  if (!orderList) return;
  orderList.innerHTML = Object.entries(orderPresets)
    .map(([key, preset]) => `
      <button class="order-preset${state.orderPreset === key ? " active" : ""}" type="button" data-order-preset="${key}">
        ${preset.label}
      </button>
    `)
    .join("");
}

function renderAll() {
  renderTodayText();
  renderSteps();
  renderTimer();
  renderRecords();
  renderSettings();
}

function bindTabs() {
  $$(".bottom-nav button").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      $$(".bottom-nav button").forEach((item) => item.classList.toggle("active", item === button));
      $$(".view").forEach((view) => view.classList.toggle("active", view.dataset.view === tab));
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function bindControls() {
  $("#startButton").addEventListener("click", startTimer);
  $("#resetButton")?.addEventListener("click", resetTimer);

  $$("input[name='brushCount']").forEach((input) => {
    input.addEventListener("change", () => {
      state.brushCount = Number(input.value);
      if (state.brushCount < 3 && state.reminderPeriod === "noon") state.reminderPeriod = "night";
      saveState();
      renderAll();
    });
  });

  $$("input[name='brushDuration']").forEach((input) => {
    input.addEventListener("change", () => {
      state.brushMinutes = Number(input.value);
      saveState();
      resetTimer(false);
      renderAll();
    });
  });

  $$("input[name='reminderTime']").forEach((input) => {
    input.addEventListener("change", () => {
      state.reminderTimes = {
        ...state.reminderTimes,
        [input.dataset.period]: input.value,
      };
      saveState();
      renderSettings();
      toast(`已设置${getPeriodLabel(input.dataset.period)} ${input.value}`);
    });
  });

  $("#notificationButton")?.addEventListener("click", async () => {
    if (!("Notification" in window)) {
      toast("当前浏览器不支持通知");
      return;
    }
    const permission = await Notification.requestPermission();
    toast(permission === "granted" ? "通知提醒已开启" : "通知权限未开启");
  });

  $("#reminderHelpButton")?.addEventListener("click", () => {
    toast("1点到12点早间，12点到17点午间，17点到1点晚间");
  });

  $("#orderList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-order-preset]");
    if (!button) return;
    state.orderPreset = button.dataset.orderPreset;
    saveState();
    resetTimer(false);
    renderAll();
  });

  $("#syncCodeButton")?.addEventListener("click", requestSyncCode);
  $("#syncNowButton")?.addEventListener("click", syncCloudRecords);
  $("#syncLogoutButton")?.addEventListener("click", signOutSync);
  $("#syncOpenButton")?.addEventListener("click", openSyncDialog);
  $("#syncDialogClose")?.addEventListener("click", closeSyncDialog);
  $("#syncDialog")?.addEventListener("click", (event) => {
    if (event.target.id === "syncDialog") closeSyncDialog();
  });
}

async function initCloudSync() {
  const client = getSupabaseClient();
  if (!client) {
    renderSyncUi();
    return;
  }
  const { data } = await client.auth.getSession();
  currentUser = data.session?.user || null;
  renderSyncUi();
  if (currentUser) syncCloudRecords();
  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    renderSyncUi();
    if (currentUser) syncCloudRecords();
  });
}

async function requestSyncCode() {
  const client = getSupabaseClient();
  const email = $("#syncEmail")?.value.trim();
  if (!client) {
    toast("云同步加载失败，请检查网络");
    return;
  }
  if (!email) {
    toast("请输入邮箱");
    return;
  }
  syncBusy = true;
  renderSyncUi();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: AUTH_REDIRECT_URL,
      shouldCreateUser: true,
    },
  });
  syncBusy = false;
  if (!error) {
    startOtpCooldown(60);
  }
  renderSyncUi();
  let message = "登录链接已发送，请打开邮箱完成登录";
  if (error) {
    const retrySeconds = getOtpCooldownSeconds(error.message);
    if (retrySeconds > 0) {
      startOtpCooldown(retrySeconds);
      message = `登录链接已发送，请 ${retrySeconds} 秒后再试`;
    } else {
      message = `登录链接发送失败：${error.message}`;
    }
  }
  setSyncMessage(message);
  toast(message);
}

async function signOutSync() {
  const client = getSupabaseClient();
  if (!client) return;
  syncBusy = true;
  renderSyncUi();
  await client.auth.signOut();
  currentUser = null;
  syncBusy = false;
  renderSyncUi();
  closeSyncDialog();
  toast("已退出云同步");
}

async function syncRecordToCloud(record) {
  if (!currentUser) return;
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.from("brush_records").insert({
    user_id: currentUser.id,
    date: record.date,
    time: record.time,
    duration: record.duration,
    period: getRecordPeriod(record),
  });
  if (error) toast("云同步失败，本地已保存");
}

async function syncCloudRecords() {
  const client = getSupabaseClient();
  if (!client || !currentUser || syncBusy) return;
  syncBusy = true;
  renderSyncUi();

  const { data: remoteRecords, error: readError } = await client
    .from("brush_records")
    .select("id,date,time,duration,period,created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(180);

  if (readError) {
    syncBusy = false;
    renderSyncUi();
    toast("读取云端记录失败");
    return;
  }

  const remoteList = (remoteRecords || []).map((record) => ({
    id: record.id,
    date: record.date,
    time: record.time,
    duration: record.duration,
    period: record.period,
  }));
  const remoteSignatures = new Set(remoteList.map(recordSignature));
  const missingLocal = (state.records || []).filter((record) => !remoteSignatures.has(recordSignature(record)));

  if (missingLocal.length) {
    const inserts = missingLocal.map((record) => ({
      user_id: currentUser.id,
      date: record.date,
      time: record.time,
      duration: record.duration,
      period: getRecordPeriod(record),
    }));
    const { error: writeError } = await client.from("brush_records").insert(inserts);
    if (writeError) {
      syncBusy = false;
      renderSyncUi();
      toast("上传本地记录失败");
      return;
    }
  }

  const merged = [...remoteList, ...missingLocal];
  const seen = new Set();
  state.records = merged
    .filter((record) => {
      const signature = recordSignature(record);
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .slice(0, 90);
  saveState();
  syncBusy = false;
  renderAll();
  toast("云同步完成");
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
}

bindTabs();
bindControls();
renderAll();
initCloudSync();
checkReminders();
setInterval(checkReminders, 30 * 1000);
