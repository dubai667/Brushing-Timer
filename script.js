const STORAGE_KEY = "toothTimer:v1";

const steps = [
  { title: "上排外侧", hint: "牙刷轻轻打圈，照顾到牙龈边缘。", zone: "M83 113c15-12 38-13 58-4", brush: "translate(0 0)" },
  { title: "上排内侧", hint: "牙刷稍微倾斜，慢慢刷到门牙内侧。", zone: "M102 104c18 17 47 17 65 0", brush: "translate(-18 24) rotate(-14deg)" },
  { title: "上排咬合面", hint: "前后来回刷，不要漏掉臼齿。", zone: "M86 143c22-8 55-8 78 1", brush: "translate(-4 42) rotate(12deg)" },
  { title: "下排外侧", hint: "从左到右移动，保持小幅度震动。", zone: "M87 168c24 10 62 10 85-2", brush: "translate(-12 72) rotate(-8deg)" },
  { title: "下排内侧", hint: "竖起牙刷刷前牙内侧，动作轻一点。", zone: "M105 178c18 17 40 17 58 0", brush: "translate(-35 82) rotate(-18deg)" },
  { title: "下排咬合面", hint: "最后刷咬合面，完成后漱口。", zone: "M92 190c23 12 56 12 80 0", brush: "translate(-5 96) rotate(10deg)" },
];

const defaultState = {
  stepDuration: 20,
  reminderTime: "21:30",
  session: "morning",
  records: [],
};

let state = loadState();
let timer = {
  running: false,
  done: false,
  startedAt: null,
  elapsed: 0,
  interval: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadState() {
  try {
    return { ...defaultState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function totalDuration() {
  return steps.length * Number(state.stepDuration || 20);
}

function formatSeconds(value) {
  const safe = Math.max(0, Math.ceil(value));
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const seconds = String(safe % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getCurrentSessionLabel() {
  return state.session === "night" ? "晚上刷牙" : "早上刷牙";
}

function renderTodayText() {
  $("#todayText").textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
  $("#sessionLabel").textContent = getCurrentSessionLabel();
}

function getTimerElapsed() {
  if (!timer.running) return timer.elapsed;
  return timer.elapsed + (Date.now() - timer.startedAt) / 1000;
}

function getTimerInfo() {
  const elapsed = Math.min(getTimerElapsed(), totalDuration());
  const stepDuration = Number(state.stepDuration || 20);
  const stepIndex = Math.min(steps.length - 1, Math.floor(elapsed / stepDuration));
  const stepElapsed = elapsed - stepIndex * stepDuration;
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
  const step = steps[info.stepIndex];
  const progress = totalDuration() ? (info.elapsed / totalDuration()) * 360 : 0;
  const idle = !timer.running && !timer.done && info.elapsed <= 0.1;

  $("#timeLeft").textContent = idle ? "00:00" : formatSeconds(info.remaining);
  $("#stepTimeLeft").textContent = idle ? "准备开始" : `本步 ${Math.max(0, Math.ceil(info.stepRemaining))}s`;
  $("#stepIndex").textContent = `第 ${info.stepIndex + 1} / ${steps.length} 步`;
  $("#stepTitle").textContent = step.title;
  $("#stepHint").textContent = step.hint;
  const ring = $(".timer-ring");
  $(".timer-value").setAttribute("d", getProgressArcPath(progress));
  ring.classList.toggle("no-progress", progress <= 0.1 && !timer.running);
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
  stepList.innerHTML = steps
    .map(
      (_step, index) => `<span class="step-dot" aria-label="第 ${index + 1} 步">${index + 1}</span>`,
    )
    .join("");
}

function startTimer() {
  if (timer.done) resetTimer(false);
  if (timer.running) return;
  timer.running = true;
  timer.startedAt = Date.now();
  $("#startButton").disabled = true;
  timer.interval = setInterval(renderTimer, 250);
  renderTimer();
}

function resetTimer(showToast = true) {
  timer.running = false;
  timer.done = false;
  timer.startedAt = null;
  timer.elapsed = 0;
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
  addRecord();
  renderAll();
  toast("刷牙完成");
  if (navigator.vibrate) navigator.vibrate([160, 80, 160]);
}

function addRecord() {
  const now = new Date();
  state.records.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    date: todayKey(now),
    time: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(now),
    session: state.session,
    duration: totalDuration(),
  });
  state.records = state.records.slice(0, 90);
  saveState();
}

function getStreak() {
  const days = new Set((state.records || []).map((record) => record.date));
  let count = 0;
  const cursor = new Date();
  while (days.has(todayKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function renderRecords() {
  $("#streakCount").textContent = `${getStreak()} 天`;
  $("#totalCount").textContent = `${(state.records || []).length} 次`;
  $("#recordsList").innerHTML = state.records?.length
    ? state.records
        .map(
          (record) => `
            <article class="record-item">
              <div>
                <strong>${record.date}</strong>
                <span>${record.session === "night" ? "晚上" : "早上"} · ${Math.round(record.duration / 60)} 分钟</span>
              </div>
              <span>${record.time}</span>
            </article>
          `,
        )
        .join("")
    : `<p class="empty">还没有刷牙记录。</p>`;
}

function renderSettings() {
  $("#stepDuration").value = String(state.stepDuration);
  $("#reminderTime").value = state.reminderTime || "";
  $$(".mode-card").forEach((button) => {
    button.classList.toggle("active", button.dataset.session === state.session);
  });
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

  $("#stepDuration").addEventListener("change", (event) => {
    state.stepDuration = Number(event.target.value);
    saveState();
    resetTimer(false);
    renderAll();
  });

  $("#reminderTime").addEventListener("input", (event) => {
    state.reminderTime = event.target.value;
    saveState();
  });

  $$(".mode-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.session = button.dataset.session;
      saveState();
      renderAll();
    });
  });

  $("#clearRecords").addEventListener("click", () => {
    if (!confirm("确定清空刷牙记录？")) return;
    state.records = [];
    saveState();
    renderRecords();
    toast("已清空");
  });
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
