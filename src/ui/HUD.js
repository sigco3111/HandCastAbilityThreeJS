import { ELEMENTS, ELEMENT_META } from '../config/settings.js';
import { ELEMENT_SIGILS } from './glyphs.js';
import { CONTACT_MARKUP, ContactCard } from './contact.js';
import { CAMERA_MARKUP, CameraPanel } from './CameraPanel.js';
import { DRONE_DECK_MARKUP, DroneControls } from './DroneControls.js';
import { TARGET_LAYER_MARKUP, TargetBoxes } from './TargetBoxes.js';

/**
 * Heads-up display: the ability bar, controls, live stats and toasts.
 *
 * Plain DOM — no framework. The bar is built from `ELEMENTS`, so a new ability
 * appears in it on its own; the slots are the only interactive part, and they
 * mirror the keyboard shortcuts through `onAbility`.
 *
 * The cooldown sweep is a `conic-gradient` driven by a CSS custom property, so
 * updating it every frame is one `setProperty` call and never touches layout.
 */
export class HUD {
  constructor(root) {
    this.root = root;
    this.onAbility = null;
    this._toastTimer = 0;
    this._statsAccumulator = 0;
    this._frames = 0;
    this._fps = 0;
    /** Last sweep ratio pushed to the DOM, per element. */
    this._cooldownShown = new Map();
    this._armedShown = null;

    root.innerHTML = `
      ${TARGET_LAYER_MARKUP}

      <div class="hud__panel hud__title">
        엘리멘탈 샌드박스
        <span data-blurb>Q, E, R, V, B, Z 또는 N을 누르고 조준 뒤 클릭으로 시전. F는 드론, X는 봇 배치.</span>
      </div>

      <div class="hud__panel hud__stats">
        <div>FPS <b data-stat="fps">—</b></div>
        <div>파티클 <b data-stat="particles">0</b></div>
        <div>인스턴스 <b data-stat="spikes">0</b></div>
        <div>드로우 콜 <b data-stat="calls">0</b></div>
      </div>

      <div class="hud__panel hud__help">
        <div><strong>Q</strong> — 혼돈의 떨림 &nbsp; <strong>E</strong> — 직선형 공허 베기</div>
        <div><strong>R</strong> — 빙결 파편 폭풍</div>
        <div><strong>X</strong> — 타락한 파편 생성 &nbsp; <strong>B</strong> — 빙결 감옥</div>
        <div><strong>Z</strong> — 정복의 맹독 방벽 &nbsp; <strong>F</strong> — 뱀불결계</div>
        <div><strong>V</strong> — 외륜 봇 (토글) &nbsp; <strong>Y</strong> — 감시 드론 (토글)</div>
        <div class="hud__help-note">Q, E, R은 직선 시전 — 화살표로 조준. X, B, Z, F는 원거리 시전 — 원으로 조준.</div>
        <div class="hud__help-note">V와 Y는 소환: 눌러서 배치, 다시 눌러서 회수. 스틱이나 WASD로 조종, Space를 누르거나 클릭 유지로 발사. 소환 중에는 다른 시전 불가.</div>
        <div class="hud__help-note">봇은 바퀴라 스틱 방향으로 회전하며 주행; 고정 시 스틱은 전후진.</div>
        <div><strong>이동</strong> — 조준 &nbsp; <strong>좌클릭</strong> — 시전</div>
        <div><strong>Esc / 우클릭</strong> — 시전 취소</div>
        <div><strong>우드래그</strong> — 회전 &nbsp; <strong>스크롤</strong> — 줌</div>
        <div style="margin-top:6px">
          <kbd>G</kbd> 에디터 &nbsp; <kbd>P</kbd> 일시정지 &nbsp; <kbd>C</kbd> 지우기
        </div>
        <div><kbd>T</kbd> 표적 초기화 &nbsp; <kbd>H</kbd> 도움말 숨기기</div>
        <div><kbd>M</kbd> 카메라 모드 &nbsp; <kbd>J</kbd> 손 바꾸기</div>
        <div class="hud__help-note">카메라: 손바닥 조준, 주먹 시전, 좌우 가리키기로 전환.</div>
        <div class="hud__help-note">웹캠 없음? 휴대전화 카메라 사용 가능 — 코드 스캔 (로컬 네트워크 전용).</div>
        <div class="hud__help-note">카메라 + 소환: 중심 벗어난 손바닥이 조종, 주먹이 발사 유지, 가리키기로 회수.</div>
        <div class="hud__help-note">표적에 닿은 시전은 일격 처치.</div>
        <div class="hud__help-note">뱀불결계는 알아서 표적 선정: 불사조가 하나씩 사냥.</div>
        <div class="hud__help-note">타락한 파편도 마찬가지: 빛이 빔을 쏘아 소각.</div>
        <div class="hud__help-note">빙결 감옥과 맹독 방벽은 원 안에 선 것을 취함: 동결 또는 유리화 뒤 파쇄.</div>
        <div class="hud__help-note">일시정지 중에도 에디터 변경 즉시 적용.</div>
      </div>

      <div class="hud__abilities">
        ${ELEMENTS.map((element) => {
          const meta = ELEMENT_META[element];
          return `
            <div class="ability-card" data-element="${element}" style="--accent:${meta.accent}">
              <div class="ability-card__sweep" data-sweep></div>
              <div class="ability-card__key">${meta.key}</div>
              <div class="ability-card__glyph">${ELEMENT_SIGILS[element] ?? ''}</div>
              <div class="ability-card__label">${meta.label}</div>
            </div>`;
        }).join('')}
      </div>

      ${CONTACT_MARKUP}
      ${CAMERA_MARKUP}
      ${DRONE_DECK_MARKUP}

      <div class="hud__toast" data-toast></div>
      <div class="hud__paused" data-paused>일시정지 중</div>
    `;

    this.contact = new ContactCard(root);
    this.camera = new CameraPanel(root);
    this.drone = new DroneControls(root);
    this.targets = new TargetBoxes(root);
    this.cards = new Map();
    for (const card of root.querySelectorAll('.ability-card')) {
      this.cards.set(card.dataset.element, card);
      card.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        this.onAbility?.(card.dataset.element);
      });
    }

    this.stats = {
      fps: root.querySelector('[data-stat="fps"]'),
      particles: root.querySelector('[data-stat="particles"]'),
      spikes: root.querySelector('[data-stat="spikes"]'),
      calls: root.querySelector('[data-stat="calls"]')
    };
    this.help = root.querySelector('.hud__help');
    this.toast = root.querySelector('[data-toast]');
    this.pausedBadge = root.querySelector('[data-paused]');
    this.abilityBar = root.querySelector('.hud__abilities');
  }

  /** @param {{silent?: boolean}} [options] */
  setElement(element, options = {}) {
    for (const [key, card] of this.cards) {
      card.classList.toggle('is-active', key === element);
    }
    const meta = ELEMENT_META[element];
    this.contact.setAccent(meta?.accent);
    if (meta && !options.silent) this.showToast(`${meta.hint} 선택됨`);
  }

  /**
   * Mark a slot as *running* — a summon that is out. Distinct from armed: an
   * armed slot is waiting for a click, a deployed one is already doing
   * something and the press that put it out is the press that brings it back.
   */
  setDeployed(element, on) {
    const card = this.cards.get(element);
    if (card) card.classList.toggle('is-deployed', on);
    // The deck wants the bottom-left corner, which is where the help panel's
    // tail ends up on a short window; the help stands down while it is up.
    this.root.classList.toggle('hud--drone', on);
  }

  /** Highlight the slot while a cast is armed. */
  setArmed(armed) {
    if (armed === this._armedShown) return;
    this._armedShown = armed;
    this.abilityBar.classList.toggle('is-armed', armed);
  }

  /**
   * Drive one slot's cooldown sweep. Cooldowns are per ability, so this is
   * called once per element each frame.
   *
   * @param {string} element
   * @param {number} remaining seconds left
   * @param {number} total     the full cooldown, for the sweep angle
   */
  setCooldown(element, remaining, total) {
    const card = this.cards.get(element);
    if (!card) return;

    const ratio = Math.max(0, Math.min(1, remaining / Math.max(total, 0.001)));
    const shown = this._cooldownShown.get(element) ?? -1;
    const cooling = ratio > 0.001;
    // Only touch the DOM when the sweep visibly moves — except for the step
    // that starts or ends the cooldown, which always goes through: the last
    // tick to zero is usually smaller than the threshold, and skipping it
    // left a ready slot drawn as disabled.
    if (cooling === shown > 0.001 && Math.abs(ratio - shown) < 0.01) return;
    this._cooldownShown.set(element, ratio);
    card.style.setProperty('--cooldown', ratio);
    card.classList.toggle('is-cooling', cooling);
  }

  /**
   * Swap the bottom-right corner over to the camera readout.
   *
   * The contact card and the preview want the same corner, so this is a class
   * on the HUD root rather than two independent visibilities — there is never
   * a width at which both should be on screen.
   */
  setCameraVisible(on) {
    this.root.classList.toggle('hud--camera', on);
    this.camera.setVisible(on);
  }

  /** Play the contact card's entrance once the loading veil is clearing. */
  reveal() {
    this.contact.reveal();
  }

  setPaused(paused) {
    this.pausedBadge.classList.toggle('is-visible', paused);
  }

  toggleHelp() {
    this.help.classList.toggle('is-hidden');
  }

  showToast(message, duration = 1600) {
    this.toast.textContent = message;
    this.toast.classList.add('is-visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove('is-visible'), duration);
  }

  /**
   * @param {number} dt
   * @param {() => {particles:number, spikes:number, calls:number}} collect
   *   Called only when the readout actually refreshes, so gathering the numbers
   *   (which means walking the particle pools) stays off the hot path.
   */
  update(dt, collect) {
    this._frames++;
    this._statsAccumulator += dt;
    if (this._statsAccumulator < 0.4) return;

    this._fps = Math.round(this._frames / this._statsAccumulator);
    this._frames = 0;
    this._statsAccumulator = 0;

    const info = collect();
    this.stats.fps.textContent = this._fps;
    this.stats.particles.textContent = info.particles;
    this.stats.spikes.textContent = info.spikes;
    this.stats.calls.textContent = info.calls;
  }
}

/** Boot screen helper. */
export class LoadingScreen {
  constructor() {
    this.element = document.getElementById('loader');
    this.fill = document.getElementById('loader-fill');
    this.status = document.getElementById('loader-status');
  }

  setProgress(ratio, message) {
    this.fill.style.width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
    if (message) this.status.textContent = message;
  }

  hide() {
    this.setProgress(1);
    setTimeout(() => this.element.classList.add('is-hidden'), 220);
  }

  fail(message) {
    this.status.textContent = message;
    this.status.style.color = '#ff7a6a';
  }
}
