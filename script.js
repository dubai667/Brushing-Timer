const STORAGE_KEY = "toothTimer:v1";

const steps = [
  { title: "上排外侧", duration: 20, hint: "牙刷轻轻打圈，照顾到牙龈边缘。", zone: "M83 113c15-12 38-13 58-4", brush: "translate(0 0)" },
  { title: "上排内侧", duration: 20, hint: "牙刷稍微倾斜，慢慢刷到门牙内侧。", zone: "M102 104c18 17 47 17 65 0", brush: "translate(-18 24) rotate(-14deg)" },
  { title: "上排咬合面", duration: 15, hint: "前后来回刷，不要漏掉臼齿。", zone: "M86 143c22-8 55-8 78 1", brush: "translate(-4 42) rotate(12deg)" },
  { title: "下排外侧", duration: 20, hint: "从左到右移动，保持小幅度震动。", zone: "M87 168c24 10 62 10 85-2", brush: "translate(-12 72) rotate(-8deg)" },
  { title: "下排内侧", duration: 20, hint: "竖起牙刷刷前牙内侧，动作轻一点。", zone: "M105 178c18 17 40 17 58 0", brush: "translate(-35 82) rotate(-18deg)" },
  { title: "下排咬合面", duration: 15, hint: "最后刷下排咬合面。", zone: "M92 190c23 12 56 12 80 0", brush: "translate(-5 96) rotate(10deg)" },
  { title: "舌头表面", duration: 10, hint: "轻刷舌头表面，动作放轻一点。", zone: "M104 158c15 12 40 12 55 0", brush: "translate(-24 70) rotate(-4deg)" },
];

const defaultState = {
  reminderTime: "21:30",
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
  return steps.reduce((sum, step) => sum + step.duration, 0);
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

function renderTodayText() {
  $("#todayText").textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
  $("#sessionLabel").textContent = "刷牙打卡";
}

function getTimerElapsed() {
  if (!timer.running) return timer.elapsed;
  return timer.elapsed + (Date.now() - timer.startedAt) / 1000;
}

function getTimerInfo() {
  const elapsed = Math.min(getTimerElapsed(), totalDuration());
  let stepStart = 0;
  let stepIndex = steps.findIndex((step) => {
    const stepEnd = stepStart + step.duration;
    if (elapsed < stepEnd) return true;
    stepStart = stepEnd;
    return false;
  });
  if (stepIndex < 0) {
    stepIndex = steps.length - 1;
    stepStart = totalDuration() - steps[stepIndex].duration;
  }
  const stepDuration = steps[stepIndex].duration;
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
  const step = steps[info.stepIndex];
  const progress = totalDuration() ? (info.elapsed / totalDuration()) * 360 : 0;
  const idle = !timer.running && !timer.done && info.elapsed <= 0.1;

  $("#timeLeft").textContent = formatSeconds(info.remaining);
  $("#stepTimeLeft").textContent = idle ? `本步 ${step.duration}s` : `本步 ${Math.max(0, Math.ceil(info.stepRemaining))}s`;
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
  renderCalendar();
  $("#recordsList").innerHTML = state.records?.length
    ? state.records
        .map(
          (record) => `
            <article class="record-item">
              <div>
                <strong>${record.date}</strong>
                <span>${Math.round(record.duration / 60)} 分钟</span>
              </div>
              <span>${record.time}</span>
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
  $("#reminderTime").value = state.reminderTime || "";
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

  $("#reminderTime").addEventListener("input", (event) => {
    state.reminderTime = event.target.value;
    saveState();
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
