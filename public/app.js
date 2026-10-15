
/*
 * SMART DUSTBIN COMMAND CENTER
 * ESP8266 + Adafruit IO + animated bin + Web3Forms email alerts
 *
 * Important:
 * 1. Put your Web3Forms access key below.
 * 2. Never put your Adafruit IO key in this browser file.
 * 3. Email is attempted on NORMAL -> FULL transition and via test button.
 */

const WEB3FORMS_ACCESS_KEY = '789a781e-287c-45fe-b1ae-1a75bd3889ba';

const state = {
  last: null,
  chart: null,
  activity: [],
  alertInProgress: false,
  lastAlertedTransition: null
};

const $ = (id) => document.getElementById(id);

// -------------------- HELPERS --------------------

function safeNumber(value, fallback = 0) {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatDistance(value) {
  const num = safeNumber(value, NaN);
  return Number.isFinite(num) ? num.toFixed(1) : '--';
}

function relativeTime(iso) {
  if (!iso) return 'now';

  const date = new Date(iso);
  const diff = Math.max(0, Date.now() - date.getTime());
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  return `${Math.floor(minutes / 60)}h`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function showToast(title, message, ok = true) {
  $('toastTitle').textContent = title;
  $('toastMessage').textContent = message;
  $('toast').querySelector('.toast-icon').textContent = ok ? '✓' : '!';

  $('toast').classList.add('show');

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    $('toast').classList.remove('show');
  }, 4000);
}

function addActivity(title, subtitle, iso = new Date().toISOString()) {
  state.activity.unshift({ title, subtitle, iso });
  state.activity = state.activity.slice(0, 7);

  $('activityList').innerHTML = state.activity.map((item) => `
    <div class="activity-item">
      <span class="timeline-dot"></span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.subtitle)}</small>
      </div>
      <time>${relativeTime(item.iso)}</time>
    </div>
  `).join('');
}

// -------------------- CONNECTION STATUS --------------------

function setConnectionState(online) {
  $('sidebarDot').className =
    `status-dot ${online ? 'online' : 'offline'}`;

  $('sidebarStatus').textContent =
    online ? 'Online' : 'Offline';

  $('deviceStatusText').textContent =
    online ? 'ONLINE' : 'OFFLINE';

  $('controllerStatus').textContent =
    online ? 'ONLINE' : 'OFFLINE';

  $('systemLink').textContent =
    online ? 'HEALTHY' : 'LOST';
}

// -------------------- WEB3FORMS EMAIL --------------------

async function sendWeb3FormsAlert({ subject, message }) {
  if (
    !WEB3FORMS_ACCESS_KEY ||
    WEB3FORMS_ACCESS_KEY ===
      'PASTE_YOUR_WEB3FORMS_ACCESS_KEY_HERE'
  ) {
    throw new Error(
      'Add your Web3Forms access key near the top of public/app.js.'
    );
  }

  let response;

  try {
    response = await fetch(
      'https://api.web3forms.com/submit',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          access_key: WEB3FORMS_ACCESS_KEY,
          subject,
          from_name: 'Smart Dustbin Control Center',
          message
        })
      }
    );
  } catch (error) {
    console.error('Web3Forms network error:', error);

    throw new Error(
      'Cannot reach Web3Forms. Check internet access, browser console, and network restrictions.'
    );
  }

  const responseText = await response.text();

  let result;

  try {
    result = JSON.parse(responseText);
  } catch {
    console.error(
      'Web3Forms returned a non-JSON response:',
      responseText.slice(0, 300)
    );

    throw new Error(
      `Web3Forms returned an unexpected response (HTTP ${response.status}).`
    );
  }

  if (!response.ok || result.success !== true) {
    console.error('Web3Forms rejected the request:', {
      status: response.status,
      message: result.message,
      success: result.success
    });

    throw new Error(
      result.message ||
      `Web3Forms rejected the request (HTTP ${response.status}).`
    );
  }

  return result;
}

// -------------------- AUTOMATIC FULL-BIN EMAIL --------------------

async function sendFullBinAlert({
  garbageLevel,
  garbageDistance
}) {
  if (state.alertInProgress) {
    return;
  }

  state.alertInProgress = true;

  try {
    await sendWeb3FormsAlert({
      subject: 'SMART DUSTBIN ALERT: BIN FULL',
      message:
        'WARNING: The Smart Dustbin has reached FULL status.\n\n' +
        `Waste level: ${garbageLevel}%\n` +
        `Garbage sensor distance: ${formatDistance(garbageDistance)} cm\n` +
        `Detected at: ${new Date().toLocaleString()}\n\n` +
        'Please arrange waste collection.'
    });

    addActivity(
      'Full-bin email accepted',
      'Web3Forms accepted the alert request'
    );

    showToast(
      'Full-bin alert accepted',
      'Web3Forms accepted the email request.',
      true
    );
  } catch (error) {
    console.error('Full-bin email failed:', error);

    addActivity(
      'Full-bin email failed',
      error.message
    );

    showToast(
      'Email alert failed',
      error.message,
      false
    );
  } finally {
    state.alertInProgress = false;
  }
}

// -------------------- DASHBOARD RENDERING --------------------

function updateDashboard(payload) {
  const feeds = payload.feeds || {};

  const garbageLevel = Math.min(
    100,
    Math.max(0, safeNumber(feeds['garbage-level']?.value))
  );

  const garbageDistance = feeds['garbage-distance']?.value;
  const handDistance = feeds['hand-distance']?.value;

  const rawStatus = feeds['garbage-status']?.value;

  const reportedStatus = String(rawStatus || '')
    .trim()
    .toUpperCase();

  const lidStatus = String(
    feeds['lid-status']?.value || '--'
  ).trim().toUpperCase();

  const espStatus = String(
    feeds['esp32-status']?.value || 'OFFLINE'
  ).trim().toUpperCase();

  // Prefer the actual status feed. Use percentage only if status is missing.
  const binStatus =
    reportedStatus === 'FULL'
      ? 'FULL'
      : reportedStatus === 'NORMAL'
        ? 'NORMAL'
        : garbageLevel >= 100
          ? 'FULL'
          : 'NORMAL';

  const isFull = binStatus === 'FULL';

  // Update percentage and progress bar.
  $('garbageLevel').textContent =
    `${garbageLevel.toFixed(0)}%`;

  $('levelBar').style.width = `${garbageLevel}%`;

  $('levelLabel').textContent = isFull
    ? 'FULL • ALERT'
    : garbageLevel >= 80
      ? 'CRITICAL'
      : garbageLevel >= 60
        ? 'HIGH'
        : 'OPTIMAL';

  $('garbageTrend').textContent = isFull
    ? 'collection required now'
    : garbageLevel >= 80
      ? 'attention required'
      : 'within monitored range';

  // Update sensor readings and statuses.
  $('handDistance').textContent =
    formatDistance(handDistance);

  $('garbageDistance').textContent =
    formatDistance(garbageDistance);

  $('binStatus').textContent = binStatus;
  $('lidStatus').textContent = lidStatus;

  $('lidChip').textContent =
    lidStatus === 'OPEN' ? 'ACTIVE' : 'READY';

  $('mqttChip').textContent = payload.ok
    ? 'API LIVE'
    : 'ERROR';

  // Update animated bin state.
  const ring = $('binStatusRing');

  ring.className =
    `status-ring ${isFull ? 'full' : 'normal'}`;

  ring.setAttribute(
    'aria-label',
    isFull ? 'Dustbin full' : 'Dustbin normal'
  );

  $('binFill').style.height = `${garbageLevel}%`;

  const binShell = document.querySelector('.bin-shell');

  if (binShell) {
    binShell.classList.toggle('full', isFull);
    binShell.classList.toggle('normal', !isFull);
  }

  $('binLid').classList.toggle(
    'open',
    lidStatus === 'OPEN' || isFull
  );

  document.body.classList.toggle('dustbin-full', isFull);

  // A connection is confirmed by a recent backend response.
  setConnectionState(
    espStatus.includes('ONLINE')
  );

  $('lastUpdated').textContent =
    new Date().toLocaleTimeString([], { hour12: false });

  // Log changes to activity feed.
  if (state.last) {
    if (state.last.binStatus !== binStatus) {
      addActivity(
        `Bin status → ${binStatus}`,
        `Waste level ${garbageLevel}%; distance ${formatDistance(garbageDistance)} cm`
      );
    }

    if (state.last.lidStatus !== lidStatus) {
      addActivity(
        `Lid → ${lidStatus}`,
        'Servo state changed'
      );
    }

    // Send only when status transitions from NORMAL to FULL.
    if (
      state.last.binStatus !== 'FULL' &&
      binStatus === 'FULL' &&
      !state.alertInProgress
    ) {
      sendFullBinAlert({
        garbageLevel,
        garbageDistance
      });
    }
  } else if (isFull) {
    // On first page load, don't send an automatic email.
    // This avoids an unexpected email when opening the dashboard
    // while the bin was already full.
    addActivity(
      'Bin already full',
      'Automatic email waits for the next NORMAL → FULL transition'
    );
  }

  state.last = {
    binStatus,
    lidStatus,
    garbageLevel,
    garbageDistance,
    handDistance
  };
}

// -------------------- LOAD LIVE ADAFRUIT DATA --------------------

async function loadDashboard() {
  try {
    const response = await fetch(
      '/api/dashboard',
      { cache: 'no-store' }
    );

    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(
        payload.error || 'Dashboard API failed'
      );
    }

    updateDashboard(payload);
  } catch (error) {
    console.error('Dashboard telemetry error:', error);

    setConnectionState(false);
    $('sidebarStatus').textContent = 'API error';

    showToast(
      'Telemetry error',
      error.message,
      false
    );
  }
}

// -------------------- HISTORY CHART --------------------

async function loadHistory() {
  try {
    const response = await fetch(
      '/api/history/garbage-level?limit=30',
      { cache: 'no-store' }
    );

    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(
        payload.error || 'History API failed'
      );
    }

    drawChart(payload.history || []);
  } catch (error) {
    console.error('History loading error:', error);
    drawChart([]);
  }
}

function drawChart(history) {
  if (typeof Chart === 'undefined') {
    console.error('Chart.js is not loaded.');
    return;
  }

  const items = [...history].reverse();

  const labels = items.map((item) =>
    item.created_at
      ? new Date(item.created_at).toLocaleTimeString(
          [],
          { hour: '2-digit', minute: '2-digit' }
        )
      : ''
  );

  const values = items.map((item) =>
    Math.min(100, Math.max(0, safeNumber(item.value)))
  );

  const canvas = $('levelChart');

  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  if (state.chart) {
    state.chart.destroy();
  }

  state.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Fill %',
        data: values,
        borderWidth: 2,
        tension: 0.38,
        fill: true,
        borderColor: '#74f6b6',
        backgroundColor: 'rgba(116,246,182,.07)',
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#78aefc',
        pointHoverBorderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#09111d',
          titleColor: '#dce9f6',
          bodyColor: '#96a8bb',
          borderColor: 'rgba(159,197,239,.14)',
          borderWidth: 1,
          padding: 11,
          displayColors: false
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255,255,255,.035)',
            drawBorder: false
          },
          ticks: {
            color: '#5e7086',
            maxTicksLimit: 7,
            font: { size: 9 }
          }
        },
        y: {
          min: 0,
          max: 100,
          grid: {
            color: 'rgba(255,255,255,.045)',
            drawBorder: false
          },
          ticks: {
            color: '#5e7086',
            stepSize: 25,
            font: { size: 9 },
            callback: (value) => `${value}%`
          }
        }
      }
    }
  });
}

// -------------------- TEST EMAIL BUTTON --------------------

async function sendTestAlert() {
  const button = $('testAlertButton');

  button.disabled = true;
  button.textContent = 'Sending…';

  try {
    const level = $('garbageLevel').textContent;
    const distance = $('garbageDistance').textContent;

    await sendWeb3FormsAlert({
      subject: 'SMART DUSTBIN • DASHBOARD TEST ALERT',
      message:
        'Dashboard test alert.\n' +
        `Current garbage level: ${level}.\n` +
        `Garbage distance: ${distance} cm.\n` +
        `Time: ${new Date().toLocaleString()}.\n` +
        'This message was triggered from the Smart Dustbin Command Center.'
    });

    showToast(
      'Test email accepted',
      'Web3Forms accepted the test email request.',
      true
    );

    addActivity(
      'Test email accepted',
      'Web3Forms accepted the email request'
    );
  } catch (error) {
    console.error('Test email error:', error);

    showToast(
      'Email failed',
      error.message,
      false
    );

    addActivity(
      'Test email failed',
      error.message
    );
  } finally {
    button.disabled = false;
    button.innerHTML = '<span>↗</span> Send test alert';
  }
}

// -------------------- VISUAL DIAGNOSTICS --------------------

function runDiagnostic() {
  const box = $('alertBox');

  const steps = [
    ['Checking telemetry bridge…', 'Adafruit IO API'],
    ['Checking sensor cards…', 'UI renderer'],
    ['Checking device animation…', 'CSS bin state'],
    ['Diagnostics complete', 'Front-end checks finished']
  ];

  let index = 0;

  box.querySelector('strong').textContent = steps[0][0];
  box.querySelector('p').textContent = steps[0][1];

  const timer = setInterval(() => {
    index += 1;

    if (index >= steps.length) {
      clearInterval(timer);

      showToast(
        'Diagnostics complete',
        'Visual diagnostic finished. Check telemetry and email separately.',
        true
      );

      addActivity(
        'Visual diagnostics complete',
        'Interface checks finished'
      );

      return;
    }

    box.querySelector('strong').textContent = steps[index][0];
    box.querySelector('p').textContent = steps[index][1];
  }, 520);
}

// -------------------- BUTTONS AND NAVIGATION --------------------

$('refreshButton').addEventListener('click', async () => {
  await Promise.all([
    loadDashboard(),
    loadHistory()
  ]);

  showToast(
    'Dashboard refreshed',
    'Latest telemetry requested.',
    true
  );
});

$('testAlertButton').addEventListener(
  'click',
  sendTestAlert
);

$('diagnosticButton').addEventListener(
  'click',
  runDiagnostic
);

$('menuButton').addEventListener('click', () => {
  $('sidebar').classList.toggle('open');
});

document.querySelectorAll('.nav-link').forEach((link) => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.nav-link').forEach((node) => {
      node.classList.remove('active');
    });

    link.classList.add('active');
    $('sidebar').classList.remove('open');
  });
});

// -------------------- START APPLICATION --------------------

async function boot() {
  await Promise.all([
    loadDashboard(),
    loadHistory()
  ]);

  // Refresh live sensor data every five seconds.
  setInterval(loadDashboard, 5000);

  // Refresh chart history every fifteen seconds.
  setInterval(loadHistory, 15000);
}

boot();
