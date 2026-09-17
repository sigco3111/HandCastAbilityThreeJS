import GUI from 'lil-gui';
import { settings, CAST_ANIMATIONS } from '../config/settings.js';
import { PresetManager } from './PresetManager.js';

/**
 * Real-time VFX editor.
 *
 * Every control binds straight to a field in `config/settings.js`. Because all
 * shaders, particle systems, lights and post passes *read* those fields each
 * frame, no controller needs an onChange handler: moving a slider updates the
 * prison that is already standing, the lance that is already in the air, the
 * next cast, the environment and the post stack simultaneously, with no rebuild
 * and no shader recompilation.
 *
 * That holds while the simulation is paused (`P`), which is the point — the
 * silhouette of a frozen shatter and the shape of a stopped wake are the
 * things worth tuning, and every ability re-resolves itself from these
 * values on a zero-length frame.
 */
export class Editor {
  /**
   * @param {object} hooks { onClear, onToast }
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.presets = new PresetManager();

    this.gui = new GUI({ title: 'VFX 에디터', width: 330 });
    this.gui.domElement.style.setProperty('--title-height', '30px');

    this._presetState = { name: '내 프리셋', selected: this.presets.names[0] ?? '' };

    this._buildPresets();
    this._buildGlobal();
    this._buildAim();
    this._buildZone();
    this._buildFlux();
    this._buildVoidSlash();
    this._buildGlacial();
    this._buildShard();
    this._buildFrost();
    this._buildToxic();
    this._buildPhoenix();
    this._buildMonowheel();
    this._buildDrone();
    this._buildEnvironment();
    this._buildPost();
    this._buildCamera();
    this._buildCharacter();
    this._buildDummies();

    // Everything starts collapsed, top-level folders included. There are enough
    // controls here that any folder left open pushes the rest off the screen,
    // so the panel opens as a list of sections and the user picks one.
    this.gui.foldersRecursive().forEach((folder) => folder.close());
  }

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */

  static range(folder, object, key, min, max, step, label) {
    return folder.add(object, key, min, max, step).name(label ?? key);
  }

  /**
   * Which clip the body throws when this ability fires.
   *
   * One per ability, because the gesture is part of how a spell reads — the
   * prison and the lance should not be cast the same way. `App` reads the value
   * at the moment of the cast, so switching it applies to the very next click.
   */
  static castAnimation(folder, object) {
    return folder.add(object, 'castAnim', CAST_ANIMATIONS).name('시전 동작');
  }

  /**
   * The four colour stops of a particle system's lifetime gradient.
   *
   * `ParticleSystem#setGradient` samples them across a particle's own life, so
   * they are labelled by *when* they are seen rather than by what they are —
   * `A` is the instant it is born, `D` is the moment it dies.
   *
   * @param {string} prefix settings key without the A/B/C/D suffix
   */
  static gradient(folder, object, prefix, title) {
    const group = folder.addFolder(title);
    group.addColor(object, `${prefix}A`).name('생성');
    group.addColor(object, `${prefix}B`).name('초기');
    group.addColor(object, `${prefix}C`).name('말기');
    group.addColor(object, `${prefix}D`).name('소멸');
    return group;
  }

  refresh() {
    this.gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
  }

  toggle() {
    this.setHidden(!this._hidden);
  }

  /** Whether the column is currently stood down. */
  get hidden() {
    return this._hidden;
  }

  /**
   * Force a visibility. Remembers nothing — the caller owns the previous state,
   * because the only thing that drives this is camera mode wanting the right
   * hand column back, and it has to be able to give it up again.
   */
  setHidden(hidden) {
    this._hidden = hidden;
    this.gui.show(!hidden);
  }

  /* ------------------------------------------------------------------ */
  /* folders                                                             */
  /* ------------------------------------------------------------------ */

  _buildPresets() {
    const folder = this.gui.addFolder('프리셋');
    const state = this._presetState;

    let selector = folder
      .add(state, 'selected', this.presets.names.length ? this.presets.names : [''])
      .name('프리셋');

    // lil-gui rebuilds the controller when the option list changes, so the
    // reference has to be replaced rather than mutated.
    const refreshOptions = () => {
      const names = this.presets.names;
      selector = selector.options(names.length ? names : ['']).name('프리셋');
      selector.setValue(names.includes(state.selected) ? state.selected : (names[0] ?? ''));
    };

    folder.add(state, 'name').name('이름');

    folder
      .add(
        {
          save: () => {
            this.presets.save(state.name);
            state.selected = state.name;
            refreshOptions();
            this.hooks.onToast?.(`프리셋 "${state.name}" 저장됨`);
          }
        },
        'save'
      )
      .name('프리셋 저장');

    folder
      .add(
        {
          load: () => {
            if (this.presets.load(state.selected)) {
              this.refresh();
              this.hooks.onToast?.(`"${state.selected}"불러와짐`);
            }
          }
        },
        'load'
      )
      .name('프리셋 불러오기');

    folder
      .add(
        {
          duplicate: () => {
            const copy = this.presets.duplicate(state.selected);
            if (copy) {
              state.selected = copy;
              refreshOptions();
              this.hooks.onToast?.(`"${copy}"로 복제됨`);
            }
          }
        },
        'duplicate'
      )
      .name('복제');

    folder
      .add(
        {
          remove: () => {
            if (this.presets.remove(state.selected)) {
              refreshOptions();
              this.hooks.onToast?.('프리셋 삭제됨');
            }
          }
        },
        'remove'
      )
      .name('삭제');

    folder.add({ exportOne: () => this.presets.exportJSON() }, 'exportOne').name('현재 설정 내보내기 (JSON)');
    folder.add({ exportAll: () => this.presets.exportAll() }, 'exportAll').name('전체 프리셋 내보내기');

    folder
      .add(
        {
          import: async () => {
            const result = await this.presets.importFromFile();
            refreshOptions();
            this.refresh();
            this.hooks.onToast?.(
              result.applied
                ? '설정 가져와짐'
                : result.imported.length
                  ? `프리셋 ${result.imported.length}개 가져와짐`
                  : '가져온 것 없음'
            );
          }
        },
        'import'
      )
      .name('JSON 가져오기…');

    folder
      .add(
        {
          reset: () => {
            this.presets.reset();
            this.refresh();
            this.hooks.onToast?.('기본값으로 초기화됨');
          }
        },
        'reset'
      )
      .name('기본값으로 초기화');

    this.presetFolder = folder;
  }

  _buildGlobal() {
    const folder = this.gui.addFolder('전역');
    const g = settings.global;
    const R = Editor.range;

    R(folder, g, 'timeScale', 0.02, 2, 0.01, '시간 배율');
    R(folder, g, 'speed', 0.1, 4, 0.01, '시전 속도');
    R(folder, g, 'lifetime', 0.1, 4, 0.01, '수명');
    R(folder, g, 'glow', 0, 5, 0.01, '광택 강도');
    R(folder, g, 'shaderIntensity', 0, 2, 0.01, '셰이더 강도');
    R(folder, g, 'opacity', 0, 2, 0.01, '불투명도');
    R(folder, g, 'noiseFrequency', 0.1, 4, 0.01, '잡음 빈도');
    R(folder, g, 'noiseSpeed', 0, 4, 0.01, '잡음 속도');
    R(folder, g, 'turbulence', 0, 4, 0.01, '난류');
    R(folder, g, 'randomness', 0, 2, 0.01, '무작위성');
    R(folder, g, 'fresnel', 0, 3, 0.01, '프레넬 강도');
    R(folder, g, 'distortion', 0, 3, 0.01, '열기 일렁임');

    const particles = folder.addFolder('입자');
    R(particles, g, 'particleCount', 0, 3, 0.01, '개수');
    R(particles, g, 'particleLifetime', 0.1, 3, 0.01, '수명');
    R(particles, g, 'particleSpeed', 0.1, 3, 0.01, '속도');
    R(particles, g, 'particleSize', 0.1, 3, 0.01, '크기');
    R(particles, g, 'emissionRate', 0, 3, 0.01, '방출 비율');

    const lighting = folder.addFolder('조명·충격');
    R(lighting, g, 'lightIntensity', 0, 4, 0.01, '빛 강도');
    R(lighting, g, 'lightRadius', 0.1, 4, 0.01, '빛 반경');
    R(lighting, g, 'explosionIntensity', 0, 3, 0.01, '충돌 강도');
    R(lighting, g, 'cameraShake', 0, 3, 0.01, '카메라 흔들림');
    R(lighting, g, 'animationSpeed', 0, 3, 0.01, '애니메이션 속도');

    this.globalFolder = folder;
  }

  /* ------------------------------------------------------------------ */

  _buildAim() {
    const folder = this.gui.addFolder('➤  조준 표시기');
    const a = settings.aim;
    const R = Editor.range;

    const shape = folder.addFolder('외형 (미터)');
    R(shape, a, 'shaftWidth', 0.05, 2, 0.01, '기둥 절반 너비');
    R(shape, a, 'headLength', 0.2, 8, 0.05, '머리 길이');
    R(shape, a, 'headWidth', 0.1, 5, 0.01, '머리 절반 너비');
    R(shape, a, 'round', 0, 0.6, 0.01, '모서리 둥글기');
    R(shape, a, 'startOffset', 0, 5, 0.05, '시전 지점 틈');
    R(shape, a, 'height', 0.005, 0.4, 0.005, '공중 높이');

    const look = folder.addFolder('렌더링');
    R(look, a, 'edge', 0.01, 0.5, 0.005, '외곽선 두께');
    R(look, a, 'edgeGlow', 0, 8, 0.05, '외곽선 광택');
    R(look, a, 'softness', 0.005, 0.5, 0.005, '가장자리 부드러움');
    R(look, a, 'fill', 0, 1.5, 0.01, '내부 채움');
    R(look, a, 'fillFalloff', 0.1, 4, 0.05, '채움 감쇠');
    R(look, a, 'opacity', 0, 2, 0.01, '불투명도');
    look.addColor(a, 'colorCore').name('핵 색상');
    look.addColor(a, 'colorEdge').name('가장자리 색');
    look.addColor(a, 'colorInvalid').name('근접 경고 색');

    const energy = folder.addFolder('에너지·서리');
    R(energy, a, 'stripes', 0, 4, 0.01, '미터당 갈매기');
    R(energy, a, 'stripeSharp', 0, 1, 0.01, '갈매기 선명도');
    R(energy, a, 'stripeDepth', 0, 1, 0.01, '갈매기 깊이');
    R(energy, a, 'scrollSpeed', -10, 10, 0.05, '스크롤 속도');
    R(energy, a, 'pulse', 0, 1, 0.01, '맥동');
    R(energy, a, 'pulseSpeed', 0, 8, 0.05, '맥동 속도');
    R(energy, a, 'noise', 0, 1.5, 0.01, '서리 노이즈');
    R(energy, a, 'noiseScale', 0.1, 8, 0.05, '잡음 규모');
    R(energy, a, 'noiseSpeed', 0, 3, 0.01, '잡음 속도');
    R(energy, a, 'crystals', 0, 2, 0.01, '서리 판');
    R(energy, a, 'crystalScale', 0.2, 10, 0.05, '판 규모');

    const furniture = folder.addFolder('링·로제트');
    R(furniture, a, 'baseRing', 0, 3, 0.01, '밑면 링 반경');
    R(furniture, a, 'baseRingWidth', 0.005, 0.4, 0.005, '밑면 링 너비');
    R(furniture, a, 'tipGlyph', 0, 2, 0.01, '끝 로제트');
    R(furniture, a, 'tipGlyphSize', 0.1, 4, 0.05, '로제트 반경');
    R(furniture, a, 'tipSpin', -3, 3, 0.01, '로제트 회전');
    R(furniture, a, 'rangeArc', 0, 2, 0.01, '범위 호');
    R(furniture, a, 'reveal', 0.01, 1, 0.005, '쓸어냄 시간');
  }

  /* ------------------------------------------------------------------ */

  /**
   * The far-cast indicator — the circle every zone ability is aimed with.
   *
   * Shared, like the arrow: it is a property of the *targeting*, not of any one
   * ability, so a second far cast inherits the whole thing and brings only its
   * own `zoneRadius`. The two controls worth reaching for first are `boundary`
   * (how thick the footprint edge reads) and `snap` (how hard it overshoots on
   * the way out), which between them decide whether the circle feels like a UI
   * overlay or like something the caster is doing.
   */
  _buildZone() {
    const folder = this.gui.addFolder('◎  원거리 시전 원');
    const z = settings.zone;
    const R = Editor.range;

    const edge = folder.addFolder('경계 (미터)');
    R(edge, z, 'boundary', 0.02, 2, 0.01, '밴드 두께');
    R(edge, z, 'boundaryBias', 0, 1, 0.01, '밴드 안팎 치우침');
    R(edge, z, 'boundaryGlow', 0, 8, 0.05, '밴드 빛');
    R(edge, z, 'liner', 0.005, 0.4, 0.005, '안쪽 깔개');
    R(edge, z, 'softness', 0.005, 0.4, 0.005, '가장자리 부드러움');
    R(edge, z, 'height', 0.005, 0.4, 0.005, '공중 높이');

    const inside = folder.addFolder('내부');
    R(inside, z, 'fill', 0, 1.5, 0.01, '내부 채움');
    R(inside, z, 'fillFalloff', 0.1, 5, 0.05, '채움 감쇠');
    R(inside, z, 'rings', 0, 12, 0.1, '등고선 링');
    R(inside, z, 'ringWidth', 0.005, 0.5, 0.005, '링 너비');
    R(inside, z, 'ringSpeed', -4, 4, 0.01, '링 속도');
    R(inside, z, 'crawl', 0, 3, 0.01, '필라멘트');
    R(inside, z, 'crawlScale', 0.1, 8, 0.05, '미터당 필라멘트');
    R(inside, z, 'crawlSpeed', -4, 4, 0.01, '필라멘트 기어감');
    R(inside, z, 'noise', 0, 1.5, 0.01, '분해');
    R(inside, z, 'noiseScale', 0.1, 8, 0.05, '분해 규모');

    const furniture = folder.addFolder('눈금·소인·조준선');
    R(furniture, z, 'ticks', 0, 96, 1, '경계 눈금');
    R(furniture, z, 'tickLength', 0.05, 3, 0.01, '틱 길이');
    R(furniture, z, 'tickWidth', 0.02, 0.9, 0.01, '틱 듀티');
    R(furniture, z, 'tickSpin', -2, 2, 0.005, '틱 회전');
    R(furniture, z, 'sweep', 0, 3, 0.01, '레이더 탐색');
    R(furniture, z, 'sweepSpeed', -3, 3, 0.01, '휩쓸기 속도');
    R(furniture, z, 'core', 0, 3, 0.01, '중심 표시');
    R(furniture, z, 'coreSize', 0.05, 3, 0.01, '중심 크기');
    R(furniture, z, 'crosshair', 0, 3, 0.01, '조준선 가지');
    R(furniture, z, 'crosshairLength', 0.1, 6, 0.05, '팔 길이');
    R(furniture, z, 'pulse', 0, 1, 0.01, '맥동');
    R(furniture, z, 'pulseSpeed', 0, 8, 0.05, '맥동 속도');

    const reach = folder.addFolder('도달 링');
    R(reach, z, 'reach', 0, 3, 0.01, '도달 밝기');
    R(reach, z, 'reachWidth', 0.005, 0.5, 0.005, '도달 너비');
    R(reach, z, 'reachDashes', 0, 200, 1, '대시선');
    R(reach, z, 'reachDashGap', 0, 0.95, 0.01, '대시 간격');
    R(reach, z, 'reachSpin', -1, 1, 0.005, '대시 기어감');
    R(reach, z, 'reachLead', 0, 3, 0.01, '선행 표시');

    const look = folder.addFolder('렌더링');
    R(look, z, 'opacity', 0, 2, 0.01, '불투명도');
    R(look, z, 'reveal', 0.01, 1, 0.005, '튀어나옴 시간');
    R(look, z, 'snap', 1, 2, 0.01, '스냅 초과');
    look.addColor(z, 'colorCore').name('핵 색상');
    look.addColor(z, 'colorEdge').name('채우기 색');
    look.addColor(z, 'colorInvalid').name('근접 경고 색');
  }

  /**
   * The Shimmering Flux of Chaos, grouped by the six panels of its breakdown
   * sheet.
   *
   * The folder names are the panel names on purpose. Judging a stacked effect
   * means being able to look at one layer at a time, and the fastest way to do
   * that here is to walk down this folder zeroing `coneOpacity`,
   * `bloodOpacity`, `ribbonOpacity`, `glintRate`, `warpStrength` and `moteRate`
   * in turn — each one takes exactly one panel of the reference out of the
   * frame.
   *
   * Two units are in play. Anything about the **cast** is in metres; anything
   * named `cone*` that is a count or a fraction — rings, ribs, turns, `coneHead`,
   * `coneTailFade` — is in the funnel's own parameter space, where u runs 0 → 1
   * from the nose to the mouth. That is what lets the same mesh sit on a
   * two-metre funnel and a ten-metre one.
   */
  _buildFlux() {
    const folder = this.gui.addFolder('✦  혼돈의 떨림');
    const c = settings.flux;
    const R = Editor.range;

    const cast = folder.addFolder('시전');
    R(cast, c, 'range', 4, 60, 0.1, '최대 범위');
    R(cast, c, 'minRange', 0, 12, 0.1, '최소 범위');
    R(cast, c, 'speed', 4, 90, 0.5, '비행 속도 (m/s)');
    R(cast, c, 'burstTime', 0.1, 3, 0.01, '찢어짐');
    R(cast, c, 'fadeTime', 0.1, 4, 0.01, '잔여 소멸 시간');
    R(cast, c, 'cooldown', 0, 10, 0.05, '쿨타임');
    Editor.castAnimation(cast, c);

    /* ---- the curve everything else is hung off ---- */
    const path = folder.addFolder('비행 경로');
    R(path, c, 'weave', 0, 3, 0.01, '흔들림 (m)');
    R(path, c, 'weaveWaves', 0.05, 3, 0.01, '긴 흔들림 (rad/m)');
    R(path, c, 'weaveWaves2', 0.05, 4, 0.01, '짧은 흔들림 (rad/m)');
    R(path, c, 'weaveRise', 0, 2, 0.01, '수직 흔들림');
    R(path, c, 'launchHeight', 0.2, 3, 0.01, '발사 높이 (m)');
    R(path, c, 'flightHeight', 0.2, 6, 0.01, '순항 높이 (m)');
    R(path, c, 'riseDistance', 0.5, 20, 0.1, '안정 거리 (m)');
    R(path, c, 'trailSpan', 1, 30, 0.1, '방출기 분포 (m)');

    /* ---- panel 1 ---- */
    const cone = folder.addFolder('1 · 원뿔형 메시 궤적');
    R(cone, c, 'coneLength', 0.5, 25, 0.1, '뒤쪽 도달 (m)');
    R(cone, c, 'coneRadius', 0.05, 5, 0.01, '후방 입 반경 (m)');
    R(cone, c, 'coneTip', 0.005, 0.6, 0.005, '코 지점 반경');
    R(cone, c, 'coneFlare', 0.1, 4, 0.01, '플레어 (>1 horn)');
    R(cone, c, 'coneRings', 2, 80, 1, '가로 링 수');
    R(cone, c, 'coneRibs', 3, 64, 1, '주변 늑골');
    R(cone, c, 'coneSpiralArms', 1, 12, 1, '나선');
    R(cone, c, 'coneSpiralTurns', 0, 20, 0.1, '개당 회전 수');
    R(cone, c, 'coneSpiralSpin', -4, 4, 0.01, '나선 회전 (turns/s)');
    R(cone, c, 'coneFlow', -8, 8, 0.05, '초당 링 이동');
    R(cone, c, 'coneWire', 0.1, 6, 0.05, '링/리브 너비 (px)');
    R(cone, c, 'coneSpiralWire', 0.1, 8, 0.05, '나선 너비 (px)');
    R(cone, c, 'coneMesh', 0, 3, 0.01, '링/리브 세기');
    R(cone, c, 'coneSpiral', 0, 3, 0.01, '나선 강도');
    R(cone, c, 'coneFill', 0, 0.6, 0.005, '내부 번짐');
    R(cone, c, 'coneFresnel', 0, 3, 0.01, '실루엣 림');
    R(cone, c, 'coneFresnelPower', 0.5, 8, 0.05, '림 조임');
    R(cone, c, 'coneErode', 0, 1.5, 0.01, '관통 침식');
    R(cone, c, 'coneErodeScale', 0.1, 6, 0.05, '침식 규모');
    R(cone, c, 'coneErodeSpeed', 0, 6, 0.05, '침식 속도');
    R(cone, c, 'coneWobble', 0, 1, 0.005, '깨끗한 원뿔 기준');
    R(cone, c, 'coneWobbleScale', 0.1, 6, 0.05, '흔들거림 크기');
    R(cone, c, 'coneWobbleSpeed', 0, 6, 0.05, '흔들거림 속도');
    R(cone, c, 'coneHead', 0.01, 0.6, 0.005, '흰 끝 도달점');
    R(cone, c, 'coneNoseFade', 0.001, 0.5, 0.005, '코 덮개');
    R(cone, c, 'coneTailFade', 0.05, 1, 0.01, '입구 소멸점');
    R(cone, c, 'conePulse', 0, 5, 0.01, '따라 충전');
    R(cone, c, 'conePulseFreq', 0.2, 10, 0.05, '위로 충전');
    R(cone, c, 'conePulseSpeed', -6, 6, 0.05, '충전 속도');
    R(cone, c, 'coneBurstFlare', 0, 4, 0.01, '입구 개방');
    R(cone, c, 'coneIntensity', 0, 8, 0.01, '강도');
    R(cone, c, 'coneOpacity', 0, 2, 0.01, '불투명도');
    R(cone, c, 'coneSoftFade', 0.02, 3, 0.01, '부드러운 소멸 (m)');
    cone.addColor(c, 'colorConeCore').name('선단');
    cone.addColor(c, 'colorCone').name('본체');
    cone.addColor(c, 'colorConeTail').name('입구');

    /* ---- panel 2 ---- */
    const blood = folder.addFolder('2 · 핏방울 유체');
    R(blood, c, 'ligaments', 1, 16, 1, '가닥 수');
    R(blood, c, 'bloodRate', 0.1, 12, 0.05, '개당 초당 투척');
    R(blood, c, 'bloodLife', 0.05, 3, 0.01, '가닥 하나 수명');
    R(blood, c, 'bloodThrow', 0, 20, 0.05, '투척 속도 (m/s)');
    R(blood, c, 'bloodBack', 0, 3, 0.01, '경로 역방향');
    R(blood, c, 'bloodForward', 0, 3, 0.01, '타격 시 전진');
    R(blood, c, 'bloodBurstThrow', 0, 6, 0.05, '타격 강화');
    R(blood, c, 'bloodSpread', 0, 3, 0.01, '축 벗어남');
    R(blood, c, 'bloodCarry', 0, 1, 0.01, '선단 속도 유지');
    R(blood, c, 'bloodRootSpread', 0, 8, 0.05, '후방 찢어짐 (m)');
    R(blood, c, 'bloodGravity', 0, 30, 0.1, '중력');
    R(blood, c, 'bloodNeck', 0, 0.95, 0.01, '늘어남 (꼬리 느림)');
    R(blood, c, 'bloodCurl', 0, 5, 0.05, '휘어짐 정도');
    R(blood, c, 'bloodWidth', 0.005, 0.4, 0.005, '너비 (m)');
    R(blood, c, 'bloodTaper', 0.1, 5, 0.05, '꼬리 방향 가늘어짐');
    R(blood, c, 'bloodBeads', 0, 1.5, 0.01, '구슬 맺힘');
    R(blood, c, 'bloodBeadFreq', 0.2, 12, 0.1, '가닥 위 구슬');
    R(blood, c, 'bloodNeckDepth', 0, 1, 0.01, '끊기기 전 가늘어짐');
    R(blood, c, 'bloodGloss', 1, 120, 0.5, '하이라이트 뭉침');
    R(blood, c, 'bloodSheen', 0, 4, 0.01, '하이라이트 강도');
    R(blood, c, 'bloodRim', 0, 3, 0.01, '얇은 곳 투과');
    R(blood, c, 'bloodOpacity', 0, 1.5, 0.01, '불투명도');
    R(blood, c, 'bloodSoftFade', 0.02, 2, 0.01, '부드러운 소멸 (m)');
    blood.addColor(c, 'colorBloodDeep').name('그림자 속');
    blood.addColor(c, 'colorBlood').name('발광');
    blood.addColor(c, 'colorBloodSheen').name('젖은 반사광');
    blood.addColor(c, 'colorBloodRim').name('투과 발광');
    R(blood, c, 'dropRate', 0, 400, 1, '초당 물방울');
    R(blood, c, 'dropRadius', 0, 1, 0.01, '생성 범위 (m)');
    R(blood, c, 'dropSize', 0.005, 0.4, 0.005, '물방울 크기');
    R(blood, c, 'dropLifetime', 0.05, 4, 0.01, '물방울 수명');
    R(blood, c, 'dropGravity', 0, 40, 0.1, '물방울 중력');
    R(blood, c, 'dropStretch', 0, 2, 0.01, '물방울 늘어남');
    R(blood, c, 'dropOpacity', 0, 1.5, 0.01, '물방울 불투명도');
    R(blood, c, 'dropGlow', 0, 3, 0.01, '물방울 빛');
    R(blood, c, 'burstDrops', 0, 600, 1, '타격 투척물');
    Editor.gradient(blood, c, 'colorDrop', '물방울 그라데이션');

    /* ---- panel 3 ---- */
    const ribbons = folder.addFolder('3 · 혼돈 에너지 리본');
    R(ribbons, c, 'ribbons', 1, 12, 1, '가닥 수');
    R(ribbons, c, 'ribbonSpan', 1, 30, 0.1, '뒤쪽 도달 (m)');
    R(ribbons, c, 'ribbonLead', 0, 8, 0.05, '머리 초과 거리 (m)');
    R(ribbons, c, 'ribbonRadius', 0, 4, 0.01, '코일 반경 (m)');
    R(ribbons, c, 'ribbonCoil', 0, 8, 0.05, '구간 회전 수');
    R(ribbons, c, 'ribbonSpin', -3, 3, 0.01, '구르기 (turns/s)');
    R(ribbons, c, 'ribbonSwell', 0.1, 3, 0.01, '가장 두꺼운 곳');
    R(ribbons, c, 'ribbonChaos', 0, 4, 0.01, '축 이탈 (m)');
    R(ribbons, c, 'ribbonChaosScale', 0.1, 8, 0.05, '혼돈 규모');
    R(ribbons, c, 'ribbonChaosSpeed', 0, 5, 0.01, '혼돈 속도');
    R(ribbons, c, 'ribbonStraight', 0, 1, 0.01, '직진 비율');
    R(ribbons, c, 'ribbonStraightRadius', 0, 1, 0.01, '직진: 궤도 반경');
    R(ribbons, c, 'ribbonStraightChaos', 0, 1, 0.01, '직진: 흔들림');
    R(ribbons, c, 'ribbonStraightWidth', 0.05, 2, 0.01, '직진: 너비');
    R(ribbons, c, 'ribbonWidth', 0.005, 0.6, 0.005, '너비 (m)');
    R(ribbons, c, 'ribbonWidthTip', 0, 4, 0.01, '꼬리 너비');
    R(ribbons, c, 'ribbonTwist', 0, 1, 0.01, '띠 말림 정도');
    R(ribbons, c, 'ribbonTwistTurns', 0, 10, 0.05, '구간 비틀림');
    R(ribbons, c, 'ribbonTwistSpeed', -4, 4, 0.01, '비틀림 속도');
    R(ribbons, c, 'ribbonTwistFace', 0.02, 1, 0.01, '측면 너비');
    R(ribbons, c, 'ribbonSharp', 0.2, 8, 0.05, '가장자리 감쇠');
    R(ribbons, c, 'ribbonCore', 1, 40, 0.5, '중심 실');
    R(ribbons, c, 'ribbonPulse', 0, 5, 0.01, '따라 충전');
    R(ribbons, c, 'ribbonPulseFreq', 0.2, 10, 0.05, '위로 충전');
    R(ribbons, c, 'ribbonPulseSpeed', -6, 6, 0.05, '충전 속도');
    R(ribbons, c, 'ribbonFlicker', 0, 1, 0.01, '끊김');
    R(ribbons, c, 'ribbonFlickerScale', 0.5, 20, 0.1, '끊김 크기');
    R(ribbons, c, 'ribbonFlickerSpeed', 0, 8, 0.05, '끊김 속도');
    R(ribbons, c, 'ribbonTailFade', 0.05, 1, 0.01, '용해 지점');
    R(ribbons, c, 'ribbonIntensity', 0, 8, 0.01, '강도');
    R(ribbons, c, 'ribbonOpacity', 0, 2, 0.01, '불투명도');
    R(ribbons, c, 'ribbonSoftFade', 0.02, 3, 0.01, '부드러운 소멸 (m)');
    ribbons.addColor(c, 'colorRibbonCore').name('핵');
    ribbons.addColor(c, 'colorRibbon').name('진홍 가닥');
    ribbons.addColor(c, 'colorRibbonAlt').name('장미빛 가닥');
    ribbons.addColor(c, 'colorRibbonTail').name('꼬리');

    /* ---- panel 4 ---- */
    const glints = folder.addFolder('4 · 반짝이 불티');
    R(glints, c, 'glintRate', 0, 600, 1, '초당 반짝임');
    R(glints, c, 'glintRadius', 0, 2, 0.01, '생성 범위 (m)');
    R(glints, c, 'glintSize', 0.01, 1, 0.005, '크기');
    R(glints, c, 'glintLifetime', 0.05, 4, 0.01, '수명');
    R(glints, c, 'glintSpeed', 0, 10, 0.05, '속도');
    R(glints, c, 'glintRise', -3, 3, 0.01, '상승');
    R(glints, c, 'glintDrift', 0, 3, 0.01, '남겨진 것');
    R(glints, c, 'glintSpin', 0, 6, 0.05, '별 회전 (rad/s)');
    R(glints, c, 'glintTurbulence', 0, 3, 0.01, '난류');
    R(glints, c, 'glintGlow', 0, 6, 0.01, '광택');
    R(glints, c, 'castGlints', 0, 300, 1, '시전 시 투척');
    R(glints, c, 'burstGlints', 0, 600, 1, '타격 투척물');
    Editor.gradient(glints, c, 'colorGlint', '불티 그라데이션');

    /* ---- panel 5 ---- */
    const warp = folder.addFolder('5 · 왜곡 파동');
    R(warp, c, 'warpSize', 0.5, 16, 0.05, '도달 (m)');
    R(warp, c, 'warpLens', 0, 3, 0.01, '렌즈');
    R(warp, c, 'warpLensPower', 0.2, 6, 0.05, '렌즈 뭉침');
    R(warp, c, 'warpChurn', 0, 3, 0.01, '끓음 세기');
    R(warp, c, 'warpScale', 0.1, 6, 0.05, '휘젓기 규모');
    R(warp, c, 'warpSpeed', 0, 6, 0.05, '휘젓기 속도');
    R(warp, c, 'warpWave', 0, 3, 0.01, '파동 묶음');
    R(warp, c, 'warpWaveRate', 0, 8, 0.05, '초당 파동');
    R(warp, c, 'warpWaveWidth', 0.02, 0.6, 0.005, '묶음 깊이');
    R(warp, c, 'warpRipples', 1, 40, 0.5, '내부 밴드');
    R(warp, c, 'warpBurst', 0, 6, 0.05, '타격 파동');
    R(warp, c, 'warpBurstLife', 0.1, 4, 0.05, '지속 시간');
    R(warp, c, 'warpBurstSpeed', 1, 60, 0.5, '통과 속도 (m/s)');
    R(warp, c, 'warpBurstSize', 0, 4, 0.05, '대리 확대량');
    R(warp, c, 'warpBurstWidth', 0.02, 0.8, 0.005, '깊이');
    R(warp, c, 'warpStrength', 0, 3, 0.01, '세기');

    /* ---- panel 6 ---- */
    const motes = folder.addFolder('6 · 잔류하는 진홍 티끌');
    R(motes, c, 'moteRate', 0, 400, 1, '초당 먼지');
    R(motes, c, 'moteRadius', 0, 2, 0.01, '생성 범위 (m)');
    R(motes, c, 'moteSize', 0.005, 0.4, 0.005, '크기');
    R(motes, c, 'moteLifetime', 0.1, 8, 0.05, '수명');
    R(motes, c, 'moteSpeed', 0, 8, 0.05, '속도');
    R(motes, c, 'moteRise', -3, 3, 0.01, '상승');
    R(motes, c, 'moteDrift', 0, 3, 0.01, '남겨진 것');
    R(motes, c, 'moteTurbulence', 0, 3, 0.01, '난류');
    R(motes, c, 'moteOpacity', 0, 2, 0.01, '불투명도');
    R(motes, c, 'moteGlow', 0, 4, 0.01, '광택');
    R(motes, c, 'castMotes', 0, 300, 1, '시전 시 투척');
    R(motes, c, 'burstMotes', 0, 600, 1, '타격 투척물');
    Editor.gradient(motes, c, 'colorMote', '티끌 그라데이션');

    /* ---- everything the strike does that is not one of the six ---- */
    const strike = folder.addFolder('타격·카메라·조명');
    R(strike, c, 'impactShake', 0, 1, 0.005, '충돌 흔들림');
    R(strike, c, 'shakeDuration', 0.05, 2, 0.01, '흔들림 감쇠');
    R(strike, c, 'rumble', 0, 0.3, 0.002, '비행 진동');
    R(strike, c, 'burnShake', 0, 0.3, 0.002, '분해 진동');
    R(strike, c, 'lightIntensity', 0, 160, 0.5, '빛 강도');
    R(strike, c, 'lightRadius', 0.5, 60, 0.1, '빛 반경');
    R(strike, c, 'lightFlicker', 0, 1, 0.01, '깜빡임 깊이');
    R(strike, c, 'lightFlickerSpeed', 0.5, 30, 0.1, '깜빡임 속도');
    strike.addColor(c, 'lightColor').name('조명 색');

    this.fluxFolder = folder;
  }

  _buildVoidSlash() {
    const folder = this.gui.addFolder('🗡  공허 베기');
    const c = settings.voidslash;
    const R = Editor.range;

    const cast = folder.addFolder('시전');
    R(cast, c, 'range', 4, 60, 0.1, '최대 범위');
    R(cast, c, 'minRange', 0, 12, 0.1, '최소 범위');
    R(cast, c, 'speed', 4, 90, 0.5, '비행 속도 (m/s)');
    R(cast, c, 'burstTime', 0.1, 3, 0.01, '분해 시간');
    R(cast, c, 'fadeTime', 0.1, 6, 0.01, '잔여 소멸 시간');
    R(cast, c, 'cooldown', 0, 10, 0.05, '쿨타임');
    Editor.castAnimation(cast, c);

    /* ---- the line all six layers are hung off ---- */
    const path = folder.addFolder('비행 경로');
    R(path, c, 'drift', 0, 3, 0.01, '흔들림 (m)');
    R(path, c, 'driftWaves', 0.02, 2, 0.01, '흔들림 (rad/m)');
    R(path, c, 'driftRise', 0, 2, 0.01, '수직 흔들림');
    R(path, c, 'launchHeight', 0.2, 3, 0.01, '발사 높이 (m)');
    R(path, c, 'flightHeight', 0.2, 6, 0.01, '순항 높이 (m)');
    R(path, c, 'riseDistance', 0.5, 20, 0.1, '안정 거리 (m)');

    /* ---- panel 1 ---- */
    const lance = folder.addFolder('1 · 그림자 핵: 창');
    R(lance, c, 'lanceRows', 1, 24, 1, '비늘 줄 수');
    R(lance, c, 'lanceAround', 1, 12, 1, '주변 비늘 수');
    R(lance, c, 'lanceLength', 0.5, 12, 0.05, '끝점부터 뒤까지 (m)');
    R(lance, c, 'lanceLead', -2, 4, 0.05, '전면 앞 끝점 (m)');
    R(lance, c, 'lanceRadius', 0.05, 2, 0.01, '뒤 반경 (m)');
    R(lance, c, 'lanceFlare', 0.3, 4, 0.01, '날카로움 (>1 바늘)');
    R(lance, c, 'lanceScale', 0.02, 0.6, 0.005, '비늘 크기 (m)');
    R(lance, c, 'lanceTipScale', 0.05, 1, 0.01, '지점 비닐 (배율)');
    R(lance, c, 'lanceLong', 1, 5, 0.05, '비늘 길이·너비');
    R(lance, c, 'lanceTilt', -0.5, 1, 0.01, '비늘 기울기 (rad)');
    R(lance, c, 'lanceJitter', 0, 1, 0.01, '배치 흔들림');
    R(lance, c, 'lanceFrayStart', 0, 1, 0.01, '닳는 시작점');
    R(lance, c, 'lanceLift', 0, 1.5, 0.01, '뒤 비늘 들림 (rad)');
    R(lance, c, 'lanceFraySpread', 0, 1.5, 0.01, '뒤 비늘 들뜸 (m)');
    R(lance, c, 'lanceFlutter', 0, 1, 0.01, '떨림');
    R(lance, c, 'lanceFlutterSpeed', 0, 12, 0.05, '떨림 속도');
    R(lance, c, 'lanceVein', 0, 4, 0.01, '빛 줄기');
    R(lance, c, 'lanceVeinWidth', 0.02, 0.6, 0.01, '줄기 너비');
    R(lance, c, 'lanceVeinFlow', 0, 12, 0.05, '따라가는 맥동');
    R(lance, c, 'lanceVeinSpeed', -6, 6, 0.05, '맥동 속도');
    R(lance, c, 'lanceTipGlow', 0, 4, 0.01, '끝점 빛');
    R(lance, c, 'lanceTipPow', 0.3, 12, 0.05, '조임 정도');
    R(lance, c, 'lanceBurstSpeed', 0, 30, 0.1, '타격: 날아감 (m/s)');
    R(lance, c, 'lanceBurstSpin', 0, 8, 0.05, '타격: 회전 (turns/s)');
    R(lance, c, 'lanceBurstDrag', 0.05, 8, 0.05, '타격: 끌림');
    R(lance, c, 'lanceBurstHeat', 0, 2, 0.01, '타격: 섬광');
    R(lance, c, 'lanceIntensity', 0, 6, 0.01, '강도');
    R(lance, c, 'lanceRolloff', 0.05, 2, 0.01, '몸통 감쇠 (실체 유지)');
    R(lance, c, 'lanceOpacity', 0, 1.5, 0.01, '불투명도');
    R(lance, c, 'lanceSoftFade', 0.02, 2, 0.01, '부드러운 소멸 (m)');
    lance.addColor(c, 'colorLanceGlow').name('내부의 빛');
    lance.addColor(c, 'colorLanceHot').name('지점');

    const glass = folder.addFolder('흑유리 조명 방식');
    R(glass, c, 'obsidianBands', 1, 12, 1, '면 단차');
    R(glass, c, 'obsidianPosterize', 0, 1, 0.01, '계단 쪽 밀림');
    R(glass, c, 'obsidianScreenKey', 0, 1, 0.01, '주광: 태양 → 카메라 기준');
    R(glass, c, 'obsidianAmbient', 0, 2, 0.01, '주변광');
    R(glass, c, 'obsidianRim', 0, 5, 0.01, '실루엣 림');
    R(glass, c, 'obsidianRimPower', 0.2, 8, 0.05, '림 조임');
    R(glass, c, 'obsidianEdge', 0, 4, 0.01, '면 실금');
    R(glass, c, 'obsidianEdgeWidth', 0.2, 5, 0.05, '실선 (px)');
    R(glass, c, 'obsidianSpecular', 0, 6, 0.01, '유리 하이라이트');
    R(glass, c, 'obsidianGloss', 2, 120, 0.5, '하이라이트 뭉침');
    glass.addColor(c, 'colorObsidianDeep').name('외면');
    glass.addColor(c, 'colorObsidian').name('본체');
    glass.addColor(c, 'colorObsidianLit').name('키라이트 주시');
    glass.addColor(c, 'colorObsidianEdge').name('가장자리·외곽');

    const beam = folder.addFolder('1 · 축을 관통하는 빔');
    R(beam, c, 'beamStrands', 1, 8, 1, '축 + 위성');
    R(beam, c, 'beamSpan', 1, 30, 0.1, '뒤쪽 도달 (m)');
    R(beam, c, 'beamLead', -2, 4, 0.05, '전면 앞 끝점 (m)');
    R(beam, c, 'beamRadius', 0, 1, 0.005, '위성 궤도 (m)');
    R(beam, c, 'beamCoil', 0, 12, 0.05, '위성 회전 수');
    R(beam, c, 'beamSpin', -6, 6, 0.05, '위성 구르기 (turns/s)');
    R(beam, c, 'beamWidth', 0.005, 1, 0.005, '너비 (m)');
    R(beam, c, 'beamSatellite', 0.05, 1.5, 0.01, '위성 너비 ×');
    R(beam, c, 'beamBow', 0.05, 3, 0.01, '끝점 조임');
    R(beam, c, 'beamTailThin', 0, 1, 0.01, '꼬리 가늘기 ×');
    R(beam, c, 'beamWander', 0, 1, 0.005, '흔들림 (m)');
    R(beam, c, 'beamWanderScale', 0.1, 10, 0.05, '흔들림 크기');
    R(beam, c, 'beamWanderSpeed', 0, 6, 0.05, '흔들림 속도');
    R(beam, c, 'beamSoft', 0.1, 6, 0.05, '가장자리 감쇠');
    R(beam, c, 'beamCore', 1, 40, 0.5, '중심 실');
    R(beam, c, 'beamCoreWeight', 0, 3, 0.01, '중심 강도');
    R(beam, c, 'beamFiber', 0, 1.5, 0.01, '섬유');
    R(beam, c, 'beamFiberScale', 0.5, 20, 0.1, '섬유 규모');
    R(beam, c, 'beamFiberSpeed', 0, 8, 0.05, '섬유 속도');
    R(beam, c, 'beamPulse', 0, 5, 0.01, '따라 충전');
    R(beam, c, 'beamPulseFreq', 0.2, 10, 0.05, '위로 충전');
    R(beam, c, 'beamPulseSpeed', -6, 6, 0.05, '충전 속도 (지점 가산)');
    R(beam, c, 'beamHeadGlow', 0, 4, 0.01, '끝이 더 뜨거움');
    R(beam, c, 'beamFlare', 0, 6, 0.05, '타격: 점 확산');
    R(beam, c, 'beamIntensity', 0, 8, 0.01, '강도');
    R(beam, c, 'beamOpacity', 0, 2, 0.01, '불투명도');
    R(beam, c, 'beamSoftFade', 0.02, 3, 0.01, '부드러운 소멸 (m)');
    beam.addColor(c, 'colorBeamCore').name('핵');
    beam.addColor(c, 'colorBeam').name('본체');
    beam.addColor(c, 'colorBeamTail').name('꼬리');

    /* ---- panel 2 ---- */
    const debris = folder.addFolder('2 · 입자 잔해');
    R(debris, c, 'debrisCount', 1, 220, 1, '파편');
    R(debris, c, 'debrisSlivers', 0, 1, 0.01, '나란한 파편');
    R(debris, c, 'debrisLife', 0.1, 4, 0.01, '조각 하나 수명');
    R(debris, c, 'debrisLead', -8, 4, 0.05, '전방 이탈 (m)');
    R(debris, c, 'debrisRadius', 0, 3, 0.01, '생성 범위 (m)');
    R(debris, c, 'debrisThrow', 0, 20, 0.05, '투척 속도 (m/s)');
    R(debris, c, 'debrisForward', 0, 3, 0.01, '진행 방향 따라');
    R(debris, c, 'debrisSpread', 0, 3, 0.01, '축 벗어남');
    R(debris, c, 'debrisCarry', 0, 1.4, 0.01, '선단 속도 유지');
    R(debris, c, 'debrisDrag', 0.05, 8, 0.05, '저항');
    R(debris, c, 'debrisGravity', 0, 20, 0.05, '중력');
    R(debris, c, 'debrisSize', 0.01, 0.8, 0.005, '크기 (m)');
    R(debris, c, 'debrisSizeVariance', 0, 1, 0.01, '크기 분산');
    R(debris, c, 'debrisLong', 1, 5, 0.05, '가장 긴 조각, x');
    R(debris, c, 'debrisSpin', 0, 4, 0.01, '텀블링 (turns/s)');
    R(debris, c, 'debrisGrowIn', 0.01, 0.6, 0.005, '크기 확정');
    R(debris, c, 'debrisShrinkOut', 0.1, 1, 0.01, '축소 시작점');
    R(debris, c, 'debrisHot', 0, 1, 0.01, '잔광 비율');
    R(debris, c, 'debrisHotGlow', 0, 4, 0.01, '그 빛');
    R(debris, c, 'debrisHotPulse', 0, 10, 0.05, '호흡 속도');
    R(debris, c, 'debrisFlash', 0, 2, 0.01, '분리 시 섬광');
    R(debris, c, 'debrisFlashLife', 0.01, 0.6, 0.005, '섬광 지속');
    R(debris, c, 'debrisIntensity', 0, 6, 0.01, '강도');
    R(debris, c, 'debrisRolloff', 0.05, 2, 0.01, '몸통 감쇠');
    R(debris, c, 'debrisSoftFade', 0.02, 2, 0.01, '부드러운 소멸 (m)');
    debris.addColor(c, 'colorDebrisGlow').name('내부의 빛');
    debris.addColor(c, 'colorDebrisFlash').name('떨어져 나감');

    /* ---- panel 3 ---- */
    const ribbons = folder.addFolder('3 · 그림자 리본 궤적');
    R(ribbons, c, 'ribbons', 1, 8, 1, '띠');
    R(ribbons, c, 'ribbonSpan', 1, 30, 0.1, '뒤쪽 도달 (m)');
    R(ribbons, c, 'ribbonLead', -6, 4, 0.05, '전방 시작 거리 (m)');
    R(ribbons, c, 'ribbonRadius', 0, 4, 0.01, '꼬리 휨 (m)');
    R(ribbons, c, 'ribbonHeadRadius', 0, 1, 0.01, '머리 휨 (배율)');
    R(ribbons, c, 'ribbonFlatten', 0, 2, 0.01, '활 수직 절반');
    R(ribbons, c, 'ribbonCoil', 0, 4, 0.01, '구간 회전 수');
    R(ribbons, c, 'ribbonSpin', -3, 3, 0.01, '구르기 (turns/s)');
    R(ribbons, c, 'ribbonBow', 0.05, 3, 0.01, '끝에서 모임');
    R(ribbons, c, 'ribbonWander', 0, 2, 0.01, '흔들림 (m)');
    R(ribbons, c, 'ribbonWanderScale', 0.1, 8, 0.05, '흔들림 크기');
    R(ribbons, c, 'ribbonWanderSpeed', 0, 5, 0.01, '흔들림 속도');
    R(ribbons, c, 'ribbonWidth', 0.02, 1.5, 0.005, '너비 (m)');
    R(ribbons, c, 'ribbonWidthBow', 0.05, 3, 0.01, '양끝 끝점');
    R(ribbons, c, 'ribbonTwist', 0, 1, 0.01, '비단 말림 정도');
    R(ribbons, c, 'ribbonTwistTurns', 0, 10, 0.05, '구간 비틀림');
    R(ribbons, c, 'ribbonTwistSpeed', -4, 4, 0.01, '비틀림 속도');
    R(ribbons, c, 'ribbonTwistFace', 0.02, 1, 0.01, '측면 너비');
    R(ribbons, c, 'ribbonSoft', 0.1, 6, 0.05, '가장자리 감쇠');
    R(ribbons, c, 'ribbonFiber', 0, 1.5, 0.01, '섬유');
    R(ribbons, c, 'ribbonFiberScale', 0.5, 20, 0.1, '섬유 규모');
    R(ribbons, c, 'ribbonFiberSpeed', 0, 8, 0.05, '섬유 속도');
    R(ribbons, c, 'ribbonHem', 0.01, 0.6, 0.01, '점등 밑단 너비');
    R(ribbons, c, 'ribbonHemGlow', 0, 5, 0.01, '밑단 빛');
    R(ribbons, c, 'ribbonHeadGlow', 0, 4, 0.01, '앞끝 열기 상승');
    R(ribbons, c, 'ribbonPulse', 0, 5, 0.01, '따라 충전');
    R(ribbons, c, 'ribbonPulseFreq', 0.2, 10, 0.05, '위로 충전');
    R(ribbons, c, 'ribbonPulseSpeed', -6, 6, 0.05, '충전 속도');
    R(ribbons, c, 'ribbonInner', 0, 2, 0.01, '그림자 속 보라');
    R(ribbons, c, 'ribbonOpacity', 0, 1.5, 0.01, '그림자 농도');
    R(ribbons, c, 'ribbonSoftFade', 0.02, 3, 0.01, '부드러운 소멸 (m)');
    ribbons.addColor(c, 'colorRibbonShadow').name('그림자');
    ribbons.addColor(c, 'colorRibbon').name('보라');
    ribbons.addColor(c, 'colorRibbonHem').name('자락');

    /* ---- panel 4 ---- */
    const sparks = folder.addFolder('4 · 에너지 불꽃');
    R(sparks, c, 'sparkCount', 1, 200, 1, '궤적 내부');
    R(sparks, c, 'sparkLife', 0.1, 3, 0.01, '하나 수명');
    R(sparks, c, 'sparkLead', -6, 4, 0.05, '전방 방출 거리 (m)');
    R(sparks, c, 'sparkRadius', 0, 3, 0.01, '생성 범위 (m)');
    R(sparks, c, 'sparkThrow', 0, 20, 0.05, '투척 속도 (m/s)');
    R(sparks, c, 'sparkCarry', 0, 1.4, 0.01, '선단 속도 유지');
    R(sparks, c, 'sparkDrag', 0.05, 8, 0.05, '저항');
    R(sparks, c, 'sparkGravity', 0, 20, 0.05, '중력');
    R(sparks, c, 'sparkSize', 0.01, 0.6, 0.005, '크기 (m)');
    R(sparks, c, 'sparkSizeVariance', 0, 1, 0.01, '크기 분산');
    R(sparks, c, 'sparkRayLength', 0, 3, 0.01, '광선 도달, x');
    R(sparks, c, 'sparkLongRays', 0, 1, 0.01, '긴 광선형 (fraction)');
    R(sparks, c, 'sparkCoreTight', 1, 40, 0.5, '중심 조임');
    R(sparks, c, 'sparkRays', 0, 4, 0.01, '광선 밝기');
    R(sparks, c, 'sparkRaySharp', 1, 60, 0.5, '광선 가늘기');
    R(sparks, c, 'sparkTwinkle', 0, 1, 0.01, '반짝임');
    R(sparks, c, 'sparkTwinkleSpeed', 0, 20, 0.1, '반짝임 속도');
    R(sparks, c, 'sparkIntensity', 0, 8, 0.01, '강도');
    R(sparks, c, 'sparkSoftFade', 0.02, 2, 0.01, '부드러운 소멸 (m)');
    R(sparks, c, 'glareSize', 0.05, 4, 0.01, '끝점 눈부심 (m)');
    R(sparks, c, 'glareRays', 0, 4, 0.01, '눈부심 광선 도달, x');
    R(sparks, c, 'glareIntensity', 0, 8, 0.01, '눈부심 강도');
    R(sparks, c, 'glareFlare', 0, 6, 0.05, '타격: 눈부심 확산');
    R(sparks, c, 'sparkBurst', 1, 200, 1, '타격: 투척');
    R(sparks, c, 'sparkBurstLife', 0.1, 3, 0.01, '타격: 지속 시간');
    R(sparks, c, 'sparkBurstThrow', 0, 40, 0.1, '타격: 투척 속도 (m/s)');
    R(sparks, c, 'sparkBurstDrag', 0.05, 8, 0.05, '타격: 끌림');
    R(sparks, c, 'sparkBurstSize', 0.01, 0.6, 0.005, '타격: 크기 (m)');
    sparks.addColor(c, 'colorSparkCore').name('핵');
    sparks.addColor(c, 'colorSpark').name('광선');

    /* ---- panel 6 ---- */
    const motes = folder.addFolder('6 · 잔류하는 그림자 티끌');
    R(motes, c, 'moteCount', 1, 260, 1, '연기와 먼지');
    R(motes, c, 'moteBright', 0, 1, 0.01, '밝은 티끌 비율');
    R(motes, c, 'moteLife', 0.2, 8, 0.05, '하나 수명');
    R(motes, c, 'moteLead', -12, 4, 0.05, '전방 배치 거리 (m)');
    R(motes, c, 'moteRadius', 0, 4, 0.01, '축 벗어남 (m)');
    R(motes, c, 'moteCarry', 0, 1, 0.01, '선단 속도 유지');
    R(motes, c, 'moteRise', -1, 3, 0.01, '상승 속도 (m/s)');
    R(motes, c, 'moteDrift', 0, 4, 0.01, '확산 속도 (m/s)');
    R(motes, c, 'moteDrag', 0.05, 8, 0.05, '저항');
    R(motes, c, 'moteSize', 0.05, 3, 0.01, '연기 크기 (m)');
    R(motes, c, 'moteGrow', 0, 4, 0.01, '팽창 배율 ×');
    R(motes, c, 'moteSizeVariance', 0, 1, 0.01, '크기 분산');
    R(motes, c, 'moteSpin', 0, 1, 0.005, '회전 (turns/s)');
    R(motes, c, 'moteErode', 0, 1, 0.01, '노이즈 침식');
    R(motes, c, 'moteNoiseScale', 0.2, 8, 0.05, '잡음 규모');
    R(motes, c, 'moteNoiseSpeed', 0, 3, 0.01, '잡음 속도');
    R(motes, c, 'moteInnerGlow', 0, 4, 0.01, '내부 점등');
    R(motes, c, 'moteOpacity', 0, 1.5, 0.01, '그림자 농도');
    R(motes, c, 'moteBrightSize', 0.01, 0.5, 0.005, '밝은 티끌 크기 (m)');
    R(motes, c, 'moteBrightIntensity', 0, 8, 0.01, '밝은 티끌 강도');
    R(motes, c, 'moteTwinkleSpeed', 0, 12, 0.05, '반짝임 속도');
    R(motes, c, 'moteSoftFade', 0.02, 3, 0.01, '부드러운 소멸 (m)');
    motes.addColor(c, 'colorMoteShadow').name('그림자');
    motes.addColor(c, 'colorMote').name('보라');
    motes.addColor(c, 'colorMoteGlow').name('내부 발광');
    motes.addColor(c, 'colorMoteBright').name('밝은 티끌');

    /* ---- everything the strike does that is not one of the six ---- */
    const strike = folder.addFolder('타격·카메라·조명');
    R(strike, c, 'impactShake', 0, 1, 0.005, '충돌 흔들림');
    R(strike, c, 'shakeDuration', 0.05, 2, 0.01, '흔들림 감쇠');
    R(strike, c, 'rumble', 0, 0.3, 0.002, '비행 진동');
    R(strike, c, 'burnShake', 0, 0.3, 0.002, '분해 진동');
    R(strike, c, 'lightIntensity', 0, 160, 0.5, '점광');
    R(strike, c, 'lightRadius', 0.5, 60, 0.1, '점광 반경');
    R(strike, c, 'lightFlicker', 0, 1, 0.01, '점광 깜빡임');
    R(strike, c, 'lightFlickerSpeed', 0.5, 40, 0.1, '끊김 속도');
    strike.addColor(c, 'lightColor').name('점광원 색');
    R(strike, c, 'wakeLightIntensity', 0, 160, 0.5, '항적 빛');
    R(strike, c, 'wakeLightRadius', 0.5, 60, 0.1, '항적 빛 반경');
    R(strike, c, 'wakeLightBack', 0, 20, 0.1, '항적 빛 후퇴 (m)');
    R(strike, c, 'wakeBreath', 0, 1, 0.01, '항적 빛 호흡');
    R(strike, c, 'wakeBreathSpeed', 0.2, 20, 0.1, '숨결 속도');
    strike.addColor(c, 'wakeLightColor').name('궤적 광원 색');

    this.voidslashFolder = folder;
  }

  _buildGlacial() {
    const folder = this.gui.addFolder('❆  빙결 파편 폭풍');
    const c = settings.glacial;
    const R = Editor.range;

    const cast = folder.addFolder('시전');
    R(cast, c, 'range', 4, 60, 0.1, '최대 범위');
    R(cast, c, 'minRange', 0, 12, 0.1, '최소 범위');
    R(cast, c, 'speed', 4, 90, 0.5, '비행 속도 (m/s)');
    R(cast, c, 'growTime', 0.02, 1, 0.01, '손에서 자라남');
    R(cast, c, 'burstTime', 0.1, 3, 0.01, '분해 시간');
    R(cast, c, 'fadeTime', 0.1, 6, 0.01, '잔여 소멸 시간');
    R(cast, c, 'cooldown', 0, 10, 0.05, '쿨타임');
    Editor.castAnimation(cast, c);

    /* ---- the line all five layers are hung off ---- */
    const path = folder.addFolder('비행 경로');
    R(path, c, 'drift', 0, 3, 0.01, '흔들림 (m)');
    R(path, c, 'driftWaves', 0.02, 2, 0.01, '흔들림 (rad/m)');
    R(path, c, 'driftRise', 0, 2, 0.01, '수직 흔들림');
    R(path, c, 'launchHeight', 0.2, 3, 0.01, '발사 높이 (m)');
    R(path, c, 'flightHeight', 0.2, 6, 0.01, '순항 높이 (m)');
    R(path, c, 'riseDistance', 0.5, 20, 0.1, '안정 거리 (m)');

    /* ---- panel 1 ---- */
    const core = folder.addFolder('1 · 얼음 내부 메시');
    R(core, c, 'coreLength', 0.3, 8, 0.05, '코부터 뒤까지 (m)');
    R(core, c, 'coreRadius', 0.05, 2, 0.01, '거들 반경 (m)');
    R(core, c, 'coreLead', -2, 4, 0.05, '전면 앞 코 (m)');
    R(core, c, 'coreRoll', -2, 2, 0.01, '구르기 (turns/s)');
    R(core, c, 'coreWobble', 0, 0.5, 0.005, '코 흔들림 (rad)');
    R(core, c, 'coreWobbleSpeed', 0, 10, 0.05, '흔들림 속도');
    R(core, c, 'coreOpacity', 0, 1, 0.01, '표면이 내부 가림');
    R(core, c, 'coreInnerLevel', 0, 3, 0.01, '안쪽 면');
    R(core, c, 'coreInnerEdge', 0, 3, 0.01, '안쪽 면 선');
    R(core, c, 'coreGlow', 0, 3, 0.01, '중심부 빛');
    R(core, c, 'coreNoseGlow', 0, 5, 0.01, '코');
    R(core, c, 'coreNosePow', 0.3, 12, 0.05, '조임 정도');
    R(core, c, 'coreScatter', 0, 3, 0.01, '흩어진 빛');
    R(core, c, 'coreScatterPower', 0.2, 12, 0.05, '산란 조임');
    R(core, c, 'coreScatterDistort', 0, 1.5, 0.01, '산란 휨');
    R(core, c, 'coreFractures', 0, 3, 0.01, '내부 파단면');
    R(core, c, 'coreFractureScale', 0.2, 12, 0.05, '파단 규모');
    R(core, c, 'coreFractureDepth', 0, 1.5, 0.01, '파단 깊이 (m)');
    R(core, c, 'coreFractureWidth', 0.005, 0.4, 0.005, '파단 너비');
    R(core, c, 'coreHaze', 0, 1.5, 0.01, '갇힌 공기');
    R(core, c, 'coreHazeScale', 0.2, 10, 0.05, '공기 규모');
    R(core, c, 'coreFrostEtch', 0, 2, 0.01, '뒤편 서리 식각');
    R(core, c, 'coreFrostStart', 0, 1, 0.01, '식각 시작점');
    R(core, c, 'coreFrostScale', 0.5, 10, 0.05, '반경당 조각');
    R(core, c, 'corePulse', 0, 1, 0.01, '빛 호흡');
    R(core, c, 'corePulseSpeed', 0, 12, 0.05, '숨결 속도');
    R(core, c, 'coreBurstSpeed', 0, 30, 0.1, '타격: 파편 비행 (m/s)');
    R(core, c, 'coreBurstSpin', 0, 8, 0.05, '타격: 회전 (turns/s)');
    R(core, c, 'coreBurstDrag', 0.05, 8, 0.05, '타격: 끌림');
    R(core, c, 'coreBurstGravity', 0, 20, 0.1, '타격: 중력');
    R(core, c, 'coreBurstHeat', 0, 2, 0.01, '타격: 섬광');
    R(core, c, 'coreIntensity', 0, 6, 0.01, '강도');
    R(core, c, 'coreRolloff', 0.05, 2, 0.01, '몸통 감쇠 (실체 유지)');
    R(core, c, 'coreSoftFade', 0.02, 2, 0.01, '부드러운 소멸 (m)');

    const ice = folder.addFolder('얼음 조명 방식');
    ice.addColor(c, 'colorDeep').name('심층');
    ice.addColor(c, 'colorIce').name('본체');
    ice.addColor(c, 'colorFrost').name('서리·가장자리');
    ice.addColor(c, 'colorGlow').name('내부 조명');
    R(ice, c, 'iceEnv', 0, 3, 0.01, '면 내부 탐침');
    R(ice, c, 'iceSunSpec', 0, 4, 0.01, '태양 하이라이트');
    R(ice, c, 'iceGloss', 4, 300, 1, '하이라이트 뭉침');
    R(ice, c, 'iceScreenKey', 0, 1, 0.01, '주광: 태양 → 카메라 기준');
    R(ice, c, 'iceRim', 0, 4, 0.01, '실루엣 림');
    R(ice, c, 'iceRimPower', 0.2, 8, 0.05, '림 조임');
    R(ice, c, 'iceDispersion', 0, 1.5, 0.01, '림 분산');
    R(ice, c, 'iceEdge', 0, 4, 0.01, '면 실금');
    R(ice, c, 'iceEdgeWidth', 0.2, 5, 0.05, '실선 (px)');

    /* ---- panel 2 ---- */
    const vapor = folder.addFolder('2 · 서리 증기 유체');
    R(vapor, c, 'vaporCount', 1, 800, 1, '궤적 내부');
    R(vapor, c, 'vaporLife', 0.2, 6, 0.01, '연기 하나 수명');
    R(vapor, c, 'vaporLead', -8, 4, 0.05, '전방 방출 거리 (m)');
    R(vapor, c, 'vaporRadius', 0, 3, 0.01, '생성 범위 (m)');
    R(vapor, c, 'vaporCarry', 0, 1, 0.01, '궤적 선단 속도 유지');
    R(vapor, c, 'vaporSheath', 0, 1, 0.01, '결정 외피 비율');
    R(vapor, c, 'vaporSheathCarry', 0, 1.2, 0.01, '외피 선단 속도 유지');
    R(vapor, c, 'vaporSheathBack', 0, 6, 0.05, '외피 생성 거리 (m)');
    R(vapor, c, 'vaporSheathRadius', 0, 3, 0.01, '외피 반경 ×');
    R(vapor, c, 'vaporRise', -1, 3, 0.01, '상승 속도 (m/s)');
    R(vapor, c, 'vaporSpread', 0, 4, 0.01, '확산 속도 (m/s)');
    R(vapor, c, 'vaporDrag', 0.05, 8, 0.05, '저항');
    R(vapor, c, 'vaporCurl', 0, 4, 0.01, '회오리 (m/s)');
    R(vapor, c, 'vaporCurlScale', 0.1, 6, 0.01, '회오리 규모');
    R(vapor, c, 'vaporCurlSpeed', 0, 3, 0.01, '회오리 속도');
    R(vapor, c, 'vaporSize', 0.05, 2, 0.01, '연기 크기 (m)');
    R(vapor, c, 'vaporGrow', 0, 6, 0.01, '팽창 배율 ×');
    R(vapor, c, 'vaporSizeVariance', 0, 1, 0.01, '크기 분산');
    R(vapor, c, 'vaporStretch', 0, 0.6, 0.005, '속도당 늘어남');
    R(vapor, c, 'vaporStretchMax', 0, 8, 0.05, '최대 늘어남 (배율)');
    R(vapor, c, 'vaporSpin', 0, 1, 0.005, '회전 (turns/s)');
    R(vapor, c, 'vaporErode', 0, 1, 0.01, '노이즈 침식');
    R(vapor, c, 'vaporErodeOut', 0, 1, 0.01, '소멸될수록 증가');
    R(vapor, c, 'vaporNoiseScale', 0.2, 8, 0.05, '잡음 규모');
    R(vapor, c, 'vaporNoiseSpeed', 0, 3, 0.01, '잡음 속도');
    R(vapor, c, 'vaporFlow', 0, 4, 0.01, '잡음 역류 속도');
    R(vapor, c, 'vaporLit', 0, 6, 0.05, '밝은 면 대 그늘 면');
    R(vapor, c, 'vaporInnerGlow', 0, 3, 0.01, '초기 점등');
    R(vapor, c, 'vaporSheathGlow', 0, 3, 0.01, '외피 발광');
    R(vapor, c, 'vaporOpacity', 0, 1.5, 0.01, '불투명도');
    R(vapor, c, 'vaporSoftFade', 0.02, 3, 0.01, '부드러운 소멸 (m)');
    R(vapor, c, 'vaporBurst', 1, 240, 1, '타격: 분출');
    R(vapor, c, 'vaporBurstLife', 0.1, 4, 0.01, '타격: 지속');
    R(vapor, c, 'vaporBurstThrow', 0, 30, 0.1, '타격: 투척 속도 (m/s)');
    R(vapor, c, 'vaporBurstDrag', 0.05, 8, 0.05, '타격: 끌림');
    R(vapor, c, 'vaporBurstSize', 0.05, 3, 0.01, '타격: 연기 크기 (m)');
    vapor.addColor(c, 'colorVaporShade').name('그림자면');
    vapor.addColor(c, 'colorVaporLit').name('발광면');
    vapor.addColor(c, 'colorVaporGlow').name('내부의 빛');

    const silks = folder.addFolder('2 · 잔결 실크');
    R(silks, c, 'silks', 1, 8, 1, '비단');
    R(silks, c, 'silkSpan', 1, 30, 0.1, '뒤쪽 도달 (m)');
    R(silks, c, 'silkLead', -6, 4, 0.05, '전방 시작 거리 (m)');
    R(silks, c, 'silkRadius', 0, 4, 0.01, '꼬리 휨 (m)');
    R(silks, c, 'silkHeadRadius', 0, 1, 0.01, '머리 휨 (배율)');
    R(silks, c, 'silkFlatten', 0, 2, 0.01, '활 수직 절반');
    R(silks, c, 'silkCoil', 0, 4, 0.01, '구간 회전 수');
    R(silks, c, 'silkSpin', -3, 3, 0.01, '구르기 (turns/s)');
    R(silks, c, 'silkBow', 0.05, 3, 0.01, '끝에서 모임');
    R(silks, c, 'silkWander', 0, 2, 0.01, '흔들림 (m)');
    R(silks, c, 'silkWanderScale', 0.1, 8, 0.05, '흔들림 크기');
    R(silks, c, 'silkWanderSpeed', 0, 5, 0.01, '흔들림 속도');
    R(silks, c, 'silkWidth', 0.02, 2, 0.005, '너비 (m)');
    R(silks, c, 'silkWidthBow', 0.05, 3, 0.01, '양끝 끝점');
    R(silks, c, 'silkSoft', 0.1, 6, 0.05, '가장자리 감쇠');
    R(silks, c, 'silkErode', 0, 1, 0.01, '줄기로 침식');
    R(silks, c, 'silkTailErode', 0, 1, 0.01, '꼬리 쪽으로 증가');
    R(silks, c, 'silkFiberScale', 0.5, 20, 0.1, '스트리머 크기');
    R(silks, c, 'silkFlow', 0, 4, 0.01, '스트리머 후퇴');
    R(silks, c, 'silkLit', 0, 6, 0.05, '밝은 면 대 그늘 면');
    R(silks, c, 'silkHeadGlow', 0, 3, 0.01, '앞끝 밝기 상승');
    R(silks, c, 'silkOpacity', 0, 1.5, 0.01, '불투명도');
    R(silks, c, 'silkSoftFade', 0.02, 3, 0.01, '부드러운 소멸 (m)');

    /* ---- panel 3 ---- */
    const lattice = folder.addFolder('3 · 정연한 서리 격자');
    R(lattice, c, 'latticeCount', 1, 200, 1, '궤적 내부');
    R(lattice, c, 'latticeLife', 0.2, 8, 0.05, '하나 수명');
    R(lattice, c, 'latticeLead', -12, 4, 0.05, '전방 배치 거리 (m)');
    R(lattice, c, 'latticeRadius', 0, 4, 0.01, '축 벗어남 (m)');
    R(lattice, c, 'latticeCarry', 0, 1, 0.01, '선단 속도 유지');
    R(lattice, c, 'latticeFall', -1, 3, 0.01, '안정 속도 (m/s)');
    R(lattice, c, 'latticeSpread', 0, 4, 0.01, '표류 속도 (m/s)');
    R(lattice, c, 'latticeDrag', 0.05, 8, 0.05, '저항');
    R(lattice, c, 'latticeSize', 0.02, 1, 0.005, '조각 반경 (m)');
    R(lattice, c, 'latticeSizeVariance', 0, 1, 0.01, '크기 분산');
    R(lattice, c, 'latticeBig', 0, 1, 0.01, '큰 것 (fraction)');
    R(lattice, c, 'latticeBigScale', 1, 8, 0.05, '큰 것, x');
    R(lattice, c, 'latticeSpin', 0, 2, 0.005, '회전 수 (turns/s)');
    R(lattice, c, 'latticeTumble', 0, 2, 0.005, '회전 (turns/s)');
    R(lattice, c, 'latticeFill', 0, 1.5, 0.01, '몸통');
    R(lattice, c, 'latticeEdgeGlow', 0, 5, 0.01, '선');
    R(lattice, c, 'latticeSoft', 0, 0.3, 0.005, '몸통 부드러움');
    R(lattice, c, 'latticeTwinkle', 0, 1, 0.01, '반짝임');
    R(lattice, c, 'latticeTwinkleSpeed', 0, 12, 0.05, '반짝임 속도');
    R(lattice, c, 'latticeSoftFade', 0.02, 3, 0.01, '부드러운 소멸 (m)');
    R(lattice, c, 'latticeBurst', 1, 140, 1, '타격: 투척');
    R(lattice, c, 'latticeBurstLife', 0.1, 4, 0.01, '타격: 지속 시간');
    R(lattice, c, 'latticeBurstThrow', 0, 30, 0.1, '타격: 투척 속도 (m/s)');
    R(lattice, c, 'latticeBurstDrag', 0.05, 8, 0.05, '타격: 끌림');
    lattice.addColor(c, 'colorLattice').name('본체');
    lattice.addColor(c, 'colorLatticeEdge').name('선');

    /* ---- panel 4 ---- */
    const shards = folder.addFolder('4 · 반짝이는 얼음 파편');
    R(shards, c, 'shardCount', 1, 200, 1, '보석');
    R(shards, c, 'shardSplinters', 0, 1, 0.01, '나란한 파편들');
    R(shards, c, 'shardLife', 0.1, 4, 0.01, '하나 수명');
    R(shards, c, 'shardLead', -8, 4, 0.05, '전방 이탈 (m)');
    R(shards, c, 'shardRadius', 0, 3, 0.01, '생성 범위 (m)');
    R(shards, c, 'shardThrow', 0, 20, 0.05, '투척 속도 (m/s)');
    R(shards, c, 'shardForward', 0, 3, 0.01, '진행 방향 따라');
    R(shards, c, 'shardSpread', 0, 3, 0.01, '축 벗어남');
    R(shards, c, 'shardCarry', 0, 1.4, 0.01, '선단 속도 유지');
    R(shards, c, 'shardDrag', 0.05, 8, 0.05, '저항');
    R(shards, c, 'shardGravity', 0, 20, 0.05, '중력');
    R(shards, c, 'shardSize', 0.01, 0.8, 0.005, '크기 (m)');
    R(shards, c, 'shardSizeVariance', 0, 1, 0.01, '크기 분산');
    R(shards, c, 'shardLong', 1, 5, 0.05, '가장 가늘 때 ×');
    R(shards, c, 'shardSpin', 0, 4, 0.01, '텀블링 (turns/s)');
    R(shards, c, 'shardGrowIn', 0.01, 0.6, 0.005, '크기 확정');
    R(shards, c, 'shardShrinkOut', 0.1, 1, 0.01, '축소 시작점');
    R(shards, c, 'shardBands', 1, 12, 1, '면 단차');
    R(shards, c, 'shardPosterize', 0, 1, 0.01, '계단 쪽 밀림');
    R(shards, c, 'shardTip', 0, 3, 0.01, '끝점 투과 빛');
    R(shards, c, 'shardTipStart', 0, 1, 0.01, '끝점 시작점');
    R(shards, c, 'shardBack', 0, 3, 0.01, '그늘면 투과 빛');
    R(shards, c, 'shardBackPower', 0.1, 8, 0.05, '조임 정도');
    R(shards, c, 'shardTwinkle', 0, 1, 0.01, '면 반짝임');
    R(shards, c, 'shardTwinkleSpeed', 0, 10, 0.05, '깜빡임 속도');
    R(shards, c, 'shardFlash', 0, 2, 0.01, '타격 시 섬광');
    R(shards, c, 'shardFlashLife', 0.01, 0.6, 0.005, '섬광 지속');
    R(shards, c, 'shardIntensity', 0, 6, 0.01, '강도');
    R(shards, c, 'shardRolloff', 0.05, 2, 0.01, '몸통 감쇠');
    R(shards, c, 'shardSoftFade', 0.02, 2, 0.01, '부드러운 소멸 (m)');
    R(shards, c, 'shardBurst', 1, 320, 1, '타격: 투척');
    R(shards, c, 'shardBurstLife', 0.1, 3, 0.01, '타격: 지속 시간');
    R(shards, c, 'shardBurstThrow', 0, 40, 0.1, '타격: 투척 속도 (m/s)');
    R(shards, c, 'shardBurstDrag', 0.05, 8, 0.05, '타격: 끌림');
    R(shards, c, 'shardBurstSize', 0.01, 0.6, 0.005, '타격: 크기 (m)');
    R(shards, c, 'glintSize', 0, 12, 0.05, '파편별 반짝 도달, x');
    R(shards, c, 'glintChance', 0, 1, 0.01, '반짝임 확률');
    R(shards, c, 'glintSpeed', 0, 10, 0.05, '반짝 속도');
    R(shards, c, 'glintCoreTight', 1, 40, 0.5, '반짝 중심 뭉침');
    R(shards, c, 'glintRays', 0, 4, 0.01, '반짝 광선');
    R(shards, c, 'glintRaySharp', 1, 60, 0.5, '반짝 광선 가늘기');
    R(shards, c, 'glintIntensity', 0, 8, 0.01, '반짝임 강도');
    R(shards, c, 'glintSoftFade', 0.02, 2, 0.01, '반짝 감쇠 (m)');
    shards.addColor(c, 'colorGlintCore').name('반짝이 핵');
    shards.addColor(c, 'colorGlint').name('반짝이 광선');

    /* ---- panel 5 ---- */
    const warp = folder.addFolder('5 · 굴절 왜곡');
    R(warp, c, 'warpSize', 0.5, 16, 0.1, '대리 너비 (m)');
    R(warp, c, 'warpLens', 0, 3, 0.01, '유리 구슬');
    R(warp, c, 'warpLensSize', 0.05, 1, 0.01, '구체 반경 (배율)');
    R(warp, c, 'warpLensPower', 0.2, 6, 0.05, '구체 감쇠');
    R(warp, c, 'warpBow', 0, 3, 0.01, '뱃머리 파도');
    R(warp, c, 'warpBowRadius', 0.05, 1, 0.01, '휨 반경 (배율)');
    R(warp, c, 'warpBowWidth', 0.01, 0.5, 0.005, '휨 너비');
    R(warp, c, 'warpRing', 0, 3, 0.01, '방출 링');
    R(warp, c, 'warpRingRate', 0, 8, 0.05, '초당 링');
    R(warp, c, 'warpRingWidth', 0.01, 0.6, 0.005, '링 너비');
    R(warp, c, 'warpBurst', 0, 4, 0.01, '타격: 링');
    R(warp, c, 'warpBurstLife', 0.05, 3, 0.01, '타격: 링 지속');
    R(warp, c, 'warpBurstSpeed', 0, 40, 0.1, '타격: 링 확산 (m/s)');
    R(warp, c, 'warpBurstSize', 0, 6, 0.05, '타격: 대리 확대 ×');
    R(warp, c, 'warpBurstWidth', 0.01, 0.8, 0.005, '타격: 링 너비');
    R(warp, c, 'warpStrength', 0, 4, 0.01, '세기');

    /* ---- everything the strike does that is not one of the five ---- */
    const strike = folder.addFolder('타격·카메라·조명');
    R(strike, c, 'impactShake', 0, 1, 0.005, '충돌 흔들림');
    R(strike, c, 'shakeDuration', 0.05, 2, 0.01, '흔들림 감쇠');
    R(strike, c, 'rumble', 0, 0.3, 0.002, '비행 진동');
    R(strike, c, 'burnShake', 0, 0.3, 0.002, '분해 진동');
    R(strike, c, 'lightIntensity', 0, 160, 0.5, '수정 빛');
    R(strike, c, 'lightRadius', 0.5, 60, 0.1, '수정 빛 반경');
    R(strike, c, 'lightShimmer', 0, 1, 0.01, '수정 빛 아른거림');
    R(strike, c, 'lightShimmerSpeed', 0.5, 40, 0.1, '아른거림 속도');
    strike.addColor(c, 'lightColor').name('결정 광원 색');
    R(strike, c, 'wakeLightIntensity', 0, 160, 0.5, '항적 빛');
    R(strike, c, 'wakeLightRadius', 0.5, 60, 0.1, '항적 빛 반경');
    R(strike, c, 'wakeLightBack', 0, 20, 0.1, '항적 빛 후퇴 (m)');
    R(strike, c, 'wakeBreath', 0, 1, 0.01, '항적 빛 호흡');
    R(strike, c, 'wakeBreathSpeed', 0.2, 20, 0.1, '숨결 속도');
    strike.addColor(c, 'wakeLightColor').name('궤적 광원 색');

    this.glacialFolder = folder;
  }

  _buildDrone() {
    const folder = this.gui.addFolder('✈  감시 드론');
    const c = settings.drone;
    const R = Editor.range;

    const cast = folder.addFolder('소환');
    R(cast, c, 'range', 2, 20, 0.1, '소멸 고리 반경 (m)');
    R(cast, c, 'cooldown', 0, 10, 0.05, '회수 후 쿨타임');
    R(cast, c, 'deployTime', 0.2, 4, 0.01, '전개 시간 (s)');
    R(cast, c, 'recallTime', 0.2, 4, 0.01, '회수 기간 (s)');
    R(cast, c, 'launchHeight', 0.5, 4, 0.01, '출현 지점 (m)');
    R(cast, c, 'deployShake', 0, 0.5, 0.005, '도착 진동');
    cast.add(c, 'watch').name('시전자가 주시');
    Editor.castAnimation(cast, c);

    const airframe = folder.addFolder('기체');
    R(airframe, c, 'size', 0.5, 6, 0.01, '폭 (m)');
    R(airframe, c, 'altitude', 1, 10, 0.05, '공중 높이 (m)');
    R(airframe, c, 'bladeSpeed', 0, 60, 0.1, '로터 속도 (rev/s)');
    R(airframe, c, 'bladeSpinUp', 0.05, 4, 0.01, '가속 시간 (s)');
    R(airframe, c, 'bladeBlur', 0, 1.5, 0.01, '로터 잔상');
    airframe.add(c, 'counterRotate').name('역회전');
    airframe.addColor(c, 'rimColor').name('외곽 색');
    R(airframe, c, 'rimStrength', 0, 2, 0.01, '가장자리');
    R(airframe, c, 'rimPower', 0.5, 8, 0.05, '림 조임');
    airframe.addColor(c, 'revealColor').name('발자국 가장자리 색');
    R(airframe, c, 'revealWidth', 0.005, 0.5, 0.005, '자국 가장자리 (m)');
    R(airframe, c, 'revealGlow', 0, 20, 0.1, '자국 가장자리 광택');
    R(airframe, c, 'navLights', 0, 4, 0.01, '항법등');
    R(airframe, c, 'navSize', 0.02, 0.4, 0.005, '항법등 크기 (m)');
    R(airframe, c, 'strobeRate', 0, 6, 0.05, '스트로브 (flashes/s)');
    airframe.addColor(c, 'navColorFront').name('전면 램프');
    airframe.addColor(c, 'navColorBack').name('후면 램프');

    const hover = folder.addFolder('호버링');
    R(hover, c, 'hoverAmplitude', 0, 0.6, 0.005, '흔들림 (m)');
    R(hover, c, 'hoverFrequency', 0, 3, 0.01, '초당 흔들림');
    R(hover, c, 'sway', 0, 0.2, 0.001, '흔들거림 (rad)');
    R(hover, c, 'swaySpeed', 0, 4, 0.01, '흔들거림 속도');
    R(hover, c, 'bank', 0, 0.9, 0.005, '속도 기울기 (rad)');
    R(hover, c, 'bankRate', 0.0001, 0.5, 0.0001, '기울기 지연');
    R(hover, c, 'aimPitch', 0, 1, 0.01, '코 숙여 조준');

    const flight = folder.addFolder('비행·조작');
    R(flight, c, 'maxSpeed', 0.5, 25, 0.1, '최고 속도 (m/s)');
    R(flight, c, 'acceleration', 0.0005, 0.6, 0.0005, '스로틀 지연');
    R(flight, c, 'leash', 2, 40, 0.1, '줄 (m)');
    R(flight, c, 'turnRate', 0.0005, 0.6, 0.0005, '방향 지연');
    R(flight, c, 'stickDeadZone', 0, 0.5, 0.01, '스틱 데드존');
    R(flight, c, 'stickExpo', 0.5, 4, 0.05, '스틱 엑스포');
    R(flight, c, 'handDeadZone', 0, 0.8, 0.01, '손 데드존 (ndc)');
    R(flight, c, 'handFullRange', 0.1, 1, 0.01, '손 최대 기울기 (ndc)');
    R(flight, c, 'downwash', 0, 120, 1, '바닥 먼지 (particles/s)');
    R(flight, c, 'downwashSize', 0.1, 2.5, 0.01, '바닥 먼지 크기');

    const ring = folder.addFolder('사거리 링');
    R(ring, c, 'ringWidth', 0.02, 1, 0.005, '밴드 너비 (m)');
    R(ring, c, 'ringGlow', 0, 4, 0.01, '밴드 빛');
    R(ring, c, 'ringSoftness', 0.005, 0.4, 0.005, '부드러움');
    R(ring, c, 'ringFill', 0, 0.6, 0.005, '내부 번짐');
    R(ring, c, 'ringTicks', 0, 96, 1, '틱 수');
    R(ring, c, 'ringTickLength', 0, 1.2, 0.01, '틱 길이 (m)');
    R(ring, c, 'ringTickWidth', 0.02, 0.9, 0.01, '틱 듀티');
    R(ring, c, 'ringTickSpin', -0.5, 0.5, 0.005, '틱 회전 (rev/s)');
    R(ring, c, 'ringSweep', 0, 2, 0.01, '레이더 탐색');
    R(ring, c, 'ringSweepSpeed', 0, 2, 0.01, '휩쓸기 (rev/s)');
    R(ring, c, 'ringPulse', 0, 3, 0.01, '뜨거운 맥동');
    R(ring, c, 'ringOpacity', 0, 1, 0.01, '불투명도');
    ring.addColor(c, 'colorRing').name('주시 중');
    ring.addColor(c, 'colorRingHot').name('수색');

    const beam = folder.addFolder('서치라이트');
    R(beam, c, 'beamAngle', 1, 30, 0.1, '절반 각도 (deg)');
    R(beam, c, 'beamIntensity', 0, 2, 0.01, '원뿔');
    R(beam, c, 'beamEdge', 0.2, 6, 0.05, '가장자리 부드러움');
    R(beam, c, 'beamFalloff', 0, 3, 0.01, '바닥으로 감쇠');
    R(beam, c, 'beamNoise', 0, 1, 0.01, '빛 속 먼지');
    R(beam, c, 'beamNoiseScale', 0.2, 8, 0.05, '먼지 규모');
    R(beam, c, 'beamSwing', 0.0001, 0.5, 0.0001, '흔들림 지연');
    R(beam, c, 'spotIntensity', 0, 3, 0.01, '바닥 웅덩이');
    R(beam, c, 'spotLight', 0, 40, 0.1, '바닥 조명');
    R(beam, c, 'spotLightRadius', 0.5, 20, 0.1, '바닥 조명 반경');
    beam.addColor(c, 'colorBeam').name('주시 중');
    beam.addColor(c, 'colorBeamHot').name('수색');

    const hunt = folder.addFolder('조준');
    R(hunt, c, 'aimTurnRate', 0.0001, 0.5, 0.0001, '진입 지연');
    R(hunt, c, 'lockTime', 0.02, 3, 0.01, '고정 시간 (s)');
    R(hunt, c, 'lockCone', 0.02, 1.2, 0.01, '발사 범위 (rad)');
    R(hunt, c, 'aimHeight', 0, 1, 0.01, '몸 높이 조준');
    R(hunt, c, 'retarget', 0, 3, 0.01, '표적 간격 (s)');
    R(hunt, c, 'reticleSize', 0.2, 4, 0.01, '조준선 크기 (m)');
    R(hunt, c, 'reticleGlow', 0, 5, 0.01, '조준선 광택');
    hunt.addColor(c, 'colorReticle').name('고정 중');
    hunt.addColor(c, 'colorLocked').name('고정');

    const burst = folder.addFolder('폭발');
    R(burst, c, 'rounds', 1, 24, 1, '탄 수');
    R(burst, c, 'burstTime', 0.05, 2, 0.01, '기간 (s)');
    R(burst, c, 'tracerSpeed', 10, 200, 1, '추적광 속도 (m/s)');
    R(burst, c, 'tracerSize', 0.02, 0.4, 0.005, '추적광 너비 (m)');
    R(burst, c, 'tracerLength', 0.1, 6, 0.05, '추적광 길이 (m)');
    R(burst, c, 'spread', 0, 0.2, 0.001, '분산 (rad)');
    R(burst, c, 'muzzleSize', 0, 2, 0.01, '총구 섬광 (m)');
    R(burst, c, 'muzzleLight', 0, 200, 1, '총구 빛');
    burst.add(c, 'casings').name('탄피 배출');
    R(burst, c, 'impactSparks', 0, 80, 1, '충돌 불꽃');
    burst.add(c, 'scorch').name('바닥 그을리기');
    R(burst, c, 'fireShake', 0, 0.5, 0.005, '반동 진동');
    R(burst, c, 'fireFlash', 0, 0.4, 0.005, '화면 섬광');
    burst.addColor(c, 'colorTracer').name('예광탄');
    burst.addColor(c, 'colorTracerTail').name('예광탄 꼬리');
    burst.addColor(c, 'colorFlash').name('섬광');
    burst.addColor(c, 'colorSpark').name('불꽃');
    const hit = burst.addFolder('피격');
    R(hit, c.hit, 'impulse', 0, 20, 0.1, '투척 속도 (m/s)');
    R(hit, c.hit, 'lift', 0, 10, 0.1, '들어올림 (m/s)');
    R(hit, c.hit, 'spin', 0, 5, 0.05, '토크');

    const light = folder.addFolder('신체 조명');
    R(light, c, 'lightIntensity', 0, 60, 0.5, '강도');
    R(light, c, 'lightRadius', 0.5, 30, 0.1, '반경');
    light.addColor(c, 'lightColor').name('색상');

    this.droneFolder = folder;
  }

  /**
   * The Serpent Tide Field, laid out in the order of its breakdown sheet.
   *
   * Units: metres for anything about the cast, the bird or a layer's reach;
   * kelvin for the two temperatures the fire is shaded between; unitless for
   * fractions, counts and exponents.
   */
  _buildPhoenix() {
    const folder = this.gui.addFolder('🔥  뱀불결계');
    const c = settings.phoenix;
    const R = Editor.range;

    const cast = folder.addFolder('시전');
    R(cast, c, 'range', 4, 60, 0.1, '최대 범위');
    R(cast, c, 'minRange', 0, 12, 0.1, '최소 범위');
    R(cast, c, 'zoneRadius', 1, 14, 0.1, '영역 반경 (m)');
    R(cast, c, 'speed', 4, 90, 0.5, '시드 속도 (m/s)');
    R(cast, c, 'seedHeight', 0, 3, 0.01, '잎 생성 위치 (m)');
    R(cast, c, 'seedArc', 0, 6, 0.05, '시드 던지기 (m)');
    R(cast, c, 'seedTrail', 0, 400, 1, '불씨 생성/초');
    R(cast, c, 'seedSize', 0.05, 1.5, 0.01, '시드 코멧 (m)');
    R(cast, c, 'lifetime', 1, 40, 0.1, '탐색 시간 (s)');
    R(cast, c, 'fadeTime', 0.1, 6, 0.01, '연소 시간 (s)');
    R(cast, c, 'cooldown', 0, 15, 0.05, '쿨타임');
    Editor.castAnimation(cast, c);

    const eruption = folder.addFolder('분출');
    R(eruption, c, 'eruptionEmbers', 0, 600, 1, '치솟는 불씨');
    R(eruption, c, 'eruptionLight', 0, 300, 1, '빛 타격');
    R(eruption, c, 'eruptionShake', 0, 1.5, 0.005, '흔들림');
    R(eruption, c, 'eruptionFlash', 0, 0.6, 0.005, '화면 섬광');
    R(eruption, c, 'spreadTime', 0.05, 3, 0.01, '그을음 확산 (s)');

    /* ---- panel 1 ---- */
    const bird = folder.addFolder('1 · 불사조');
    const flight = bird.addFolder('비행');
    R(flight, c, 'wingspan', 1, 12, 0.05, '날개폭 (m)');
    R(flight, c, 'altitude', 0.5, 8, 0.05, '공중 높이 (m)');
    R(flight, c, 'riseTime', 0.1, 4, 0.01, '상승 시간 (s)');
    R(flight, c, 'riseFrom', -3, 0, 0.01, '시작 높이 (m)');
    R(flight, c, 'hoverAmplitude', 0, 0.6, 0.005, '흔들림 (m)');
    R(flight, c, 'hoverFrequency', 0.05, 3, 0.01, '초당 흔들림');
    R(flight, c, 'sway', 0, 0.2, 0.001, '흔들거림 (rad)');
    R(flight, c, 'swaySpeed', 0.1, 4, 0.01, '흔들거림 속도');
    R(flight, c, 'flapSpeed', 0.1, 4, 0.01, '퍼덕임 속도');
    R(flight, c, 'turnRate', 0.0001, 0.2, 0.0001, '좌회전율');
    R(flight, c, 'bank', 0, 1.2, 0.01, '기울기 (rad)');
    R(flight, c, 'bankRate', 0.001, 0.5, 0.001, '기울기 속도');
    R(flight, c, 'aimPitch', 0, 1, 0.01, '머리 숙여 조준');
    R(flight, c, 'divePitch', 0, 1.5, 0.01, '급강하 각도 (rad)');
    R(flight, c, 'burnClimb', 0, 5, 0.05, '연소 상승 (m/s)');
    R(flight, c, 'flareStrength', 0, 3, 0.01, '작동 시 플레어');

    const fire = bird.addFolder('몸을 이루는 불');
    R(fire, c, 'tempCore', 1500, 8000, 10, '중심 (K)');
    R(fire, c, 'tempEdge', 1000, 4000, 10, '가장자리 (K)');
    R(fire, c, 'emissionCurve', 0.5, 6, 0.05, '복사 지수');
    R(fire, c, 'palette', 0, 1, 0.01, '발광체 → 팔레트');
    fire.addColor(c, 'colorCore').name('핵');
    fire.addColor(c, 'colorMid').name('중간');
    fire.addColor(c, 'colorEdge').name('가장자리');
    fire.addColor(c, 'colorEmber').name('불씨');
    R(fire, c, 'bodyHeat', 0, 1.5, 0.01, '깃털 열기');
    R(fire, c, 'rimPower', 0.5, 8, 0.05, '림 출력');
    R(fire, c, 'rimStrength', 0, 4, 0.01, '림 열기');
    R(fire, c, 'flameScale', 0.2, 6, 0.05, '화염 규모 (1/m)');
    R(fire, c, 'flameRise', 0, 6, 0.05, '화염 상승 (m/s)');
    R(fire, c, 'flameStrength', 0, 2, 0.01, '화염 열 이동');
    R(fire, c, 'lick', 0, 5, 0.05, '림이 끌어올림');
    R(fire, c, 'paintShow', 0, 1.5, 0.01, '깃털 무늬 표시');
    R(fire, c, 'emission', 0, 8, 0.05, '방출');
    R(fire, c, 'featherBurn', 0, 1, 0.01, '깃 가장자리 깜빡임');
    R(fire, c, 'auraSize', 0, 0.3, 0.005, '오라 간격 (m)');
    R(fire, c, 'auraStrength', 0, 4, 0.01, '오라');
    R(fire, c, 'auraThreshold', 0, 1, 0.01, '오라 성김');
    R(fire, c, 'revealWidth', 0.01, 1, 0.005, '녹은 가장자리 (m)');
    R(fire, c, 'revealGlow', 0, 20, 0.1, '녹은 가장자리 광택');

    const hunt = bird.addFolder('수색');
    R(hunt, c, 'fireRange', 1, 30, 0.1, '작동 범위 (m)');
    R(hunt, c, 'retarget', 0, 3, 0.01, '개체 간격 (s)');
    R(hunt, c, 'aimTime', 0.02, 2, 0.01, '몸통 도달 (s)');
    R(hunt, c, 'lockCone', 0.02, 1.5, 0.01, '분출 범위 (rad)');
    R(hunt, c, 'aimHeight', 0, 1, 0.01, '높이 기준 조준');
    R(hunt, c, 'spread', 0, 0.3, 0.001, '분산 (rad)');

    const volley = bird.addFolder('일제 사격');
    R(volley, c, 'volleyRounds', 1, 12, 1, '개체당 화염구');
    R(volley, c, 'volleyInterval', 0.02, 1, 0.01, '사이 간격 (s)');
    R(volley, c, 'fireballSpeed', 3, 80, 0.5, '속도 (m/s)');
    R(volley, c, 'fireballSize', 0.05, 1.5, 0.01, '머리 반경 (m)');
    R(volley, c, 'fireballTail', 0.2, 8, 0.05, '항적 (m)');
    R(volley, c, 'fireballArc', 0, 1.5, 0.01, '던짐');
    R(volley, c, 'fireballHoming', 0.0001, 0.9, 0.0001, '유도 (fraction left/s)');
    const comet = volley.addFolder('혜성');
    R(comet, c, 'fireballIntensity', 0, 16, 0.05, '방출');
    R(comet, c, 'fireballWakeWidth', 0.1, 1.5, 0.01, '항적 조임');
    R(comet, c, 'fireballWakeSpread', 0, 2, 0.01, '항적 팽창');
    R(comet, c, 'fireballPlume', 1, 3, 0.01, '연기 기둥');
    R(comet, c, 'fireballBulge', 0, 0.8, 0.01, '돌출부');
    R(comet, c, 'fireballShred', 0, 3, 0.01, '가장자리 찢김');
    R(comet, c, 'fireballNoiseScale', 0.5, 8, 0.05, '난류 크기');
    R(comet, c, 'fireballFlow', 0, 2, 0.01, '가스 지연');
    R(comet, c, 'fireballBuoyancy', 0, 6, 0.05, '부력');
    R(comet, c, 'fireballVortex', 0, 3, 0.01, '말아올림');
    R(comet, c, 'fireballDetach', 0, 2, 0.01, '연기로 찢어짐');
    R(comet, c, 'fireballSoftness', 0.05, 1, 0.01, '부드러움');
    R(comet, c, 'fireballTailHeat', 0, 1, 0.01, '항적 열기');
    R(comet, c, 'fireballDensity', 0, 4, 0.01, '밀도');
    R(comet, c, 'fireballSoot', 0, 5, 0.01, '그을음');
    R(comet, c, 'fireballSteps', 6, 48, 1, '행진 걸음');
    R(comet, c, 'fireballHalo', 0, 3, 0.01, '후광');
    R(comet, c, 'trailRate', 0, 200, 1, '개당 초당 방출');
    R(volley, c, 'spitFlash', 0, 3, 0.01, '부리 섬광 (m)');
    R(volley, c, 'spitLight', 0, 120, 0.5, '내뿜는 빛');
    R(volley, c, 'spitShake', 0, 0.5, 0.005, '분출 흔들림');
    R(volley, c, 'impactRadius', 0.2, 5, 0.05, '폭발 (m)');
    R(volley, c, 'impactSparks', 0, 120, 1, '충돌 불꽃');
    volley.add(c, 'impactScorch').name('신체 하부 그을음');
    R(volley, c, 'hitShake', 0, 1, 0.005, '타격 흔들림');
    R(volley, c, 'hitFlash', 0, 0.5, 0.005, '타격 섬광');
    R(volley, c, 'fireballLight', 0, 160, 0.5, '타격 빛');
    const kickOff = volley.addFolder('착지 충격');
    R(kickOff, c.hit, 'impulse', 0, 30, 0.1, '충격량 (m/s)');
    R(kickOff, c.hit, 'lift', 0, 20, 0.1, '상승');
    R(kickOff, c.hit, 'spin', 0, 8, 0.05, '회전');

    const talons = bird.addFolder('발톱');
    R(talons, c, 'kickRange', 0, 12, 0.1, '반동 범위 (m)');
    R(talons, c, 'kickTime', 0.2, 3, 0.01, '급강하 왕복 (s)');
    R(talons, c, 'kickHeight', -0.5, 1.5, 0.01, '가슴 위 정지 (m)');
    R(talons, c, 'kickBurst', 0.2, 6, 0.05, '불 분출 (m)');
    R(talons, c, 'kickShake', 0, 1.5, 0.005, '흔들림');
    R(talons, c.kickHit, 'impulse', 0, 40, 0.1, '충격량 (m/s)');
    R(talons, c.kickHit, 'lift', 0, 25, 0.1, '상승');
    R(talons, c.kickHit, 'spin', 0, 10, 0.05, '회전');

    /* ---- panel 2 ---- */
    const serpents = folder.addFolder('2 · 뱀 행렬 화염 궤적');
    R(serpents, c, 'serpents', 0, 6, 1, '뱀');
    R(serpents, c, 'serpentGrowTime', 0.05, 5, 0.01, '바깥 자람 기간 (s)');
    R(serpents, c, 'serpentRadius', 0.1, 1.5, 0.01, '궤도 (of field radius)');
    R(serpents, c, 'serpentWeave', 0, 0.9, 0.01, 'S자 휘감기');
    R(serpents, c, 'serpentWaves', 1, 8, 1, '바퀴당 휨');
    R(serpents, c, 'serpentHeight', 0, 2, 0.01, '오르내림 (m)');
    R(serpents, c, 'serpentLift', 0, 2, 0.01, '등뼈 높이 (m)');
    R(serpents, c, 'serpentLength', 0.05, 1, 0.01, '궤적 (한 바퀴 대비)');
    R(serpents, c, 'serpentSpeed', -1.5, 1.5, 0.01, '초당 바퀴');
    R(serpents, c, 'serpentWidth', 0.05, 2, 0.01, '너비 (m)');
    R(serpents, c, 'serpentFloorWidth', 0, 4, 0.05, '바닥 웅덩이 (m)');
    R(serpents, c, 'serpentNoiseScale', 0.2, 6, 0.05, '잡음 규모');
    R(serpents, c, 'serpentFlow', -6, 6, 0.05, '흐름');
    R(serpents, c, 'serpentRise', 0, 4, 0.05, '상승');
    R(serpents, c, 'serpentShred', 0, 3, 0.01, '파쇄');
    R(serpents, c, 'serpentHeadGlow', 0, 4, 0.01, '머리 광택');
    R(serpents, c, 'serpentIntensity', 0, 8, 0.05, '강도');
    R(serpents, c, 'serpentFloorGlow', 0, 2, 0.01, '바닥 빛');
    R(serpents, c, 'serpentEmbers', 0, 120, 1, '머리당 초당 불씨');

    /* ---- panel 3 ---- */
    const skirt = folder.addFolder('3 · 엷은 화염 파동');
    R(skirt, c, 'skirtRadius', 0.05, 1.5, 0.01, '링 (필드 반경 대비)');
    R(skirt, c, 'skirtHeight', 0.1, 6, 0.05, '높이 (m)');
    R(skirt, c, 'skirtRiseTime', 0.05, 3, 0.01, '일어남 (s)');
    R(skirt, c, 'skirtFlare', -0.5, 1.5, 0.01, '꼭대기 기울기');
    R(skirt, c, 'skirtBreathe', 0, 0.4, 0.005, '숨쉬기');
    R(skirt, c, 'skirtNoiseScale', 0.1, 4, 0.05, '잡음 규모');
    R(skirt, c, 'skirtRise', 0, 5, 0.05, '불꽃 상승 (m/s)');
    R(skirt, c, 'skirtShred', 0, 3, 0.01, '파쇄');
    R(skirt, c, 'skirtWisp', 0, 2, 0.01, '실오라기');
    R(skirt, c, 'skirtWaveSpeed', -3, 3, 0.01, '파동/초');
    R(skirt, c, 'skirtWaveDepth', 0, 1, 0.01, '파동 깊이');
    R(skirt, c, 'skirtHeat', 0, 2, 0.01, '열기');
    R(skirt, c, 'skirtIntensity', 0, 8, 0.05, '강도');
    R(skirt, c, 'skirtOpacity', 0, 2, 0.01, '불투명도');
    R(skirt, c, 'smokeRate', 0, 80, 1, '연기/초');
    R(skirt, c, 'smokeOpacity', 0, 1, 0.01, '연기 농도');

    /* ---- panel 4 ---- */
    const scorch = folder.addFolder('4 · 지면 그을음');
    R(scorch, c, 'scorchRadius', 0.2, 2, 0.01, '도달 (of field radius)');
    R(scorch, c, 'scorchDark', 0, 1, 0.01, '어둡게');
    scorch.addColor(c, 'colorScorch').name('캐릭터');
    R(scorch, c, 'crackScale', 0.2, 5, 0.05, '미터당 판 수');
    R(scorch, c, 'crackWidth', 0.005, 0.4, 0.005, '균열 너비');
    R(scorch, c, 'crackGlow', 0, 8, 0.05, '균열 빛');
    R(scorch, c, 'crackReach', 0.1, 1.5, 0.01, '균열 뻗음');
    R(scorch, c, 'groundEmbers', 0, 5, 0.05, '껍질 속 불씨');

    /* ---- panel 5 ---- */
    const embers = folder.addFolder('5 · 떠다니는 불씨');
    R(embers, c, 'emberRate', 0, 500, 1, '영역 초당 불씨');
    R(embers, c, 'bodyEmbers', 0, 300, 1, '새당 초당 불씨');
    R(embers, c, 'emberSize', 0.01, 0.4, 0.005, '크기 (m)');
    R(embers, c, 'emberLife', 0.2, 8, 0.05, '수명 (s)');
    R(embers, c, 'emberRise', -2, 6, 0.05, '양력 (m/s²)');
    R(embers, c, 'emberGlow', 0, 8, 0.05, '광택');

    /* ---- panel 6 ---- */
    const glow = folder.addFolder('6 · 내부 발광');
    R(glow, c, 'glowRadius', 0.2, 2.5, 0.01, '도달 (of field radius)');
    R(glow, c, 'glowIntensity', 0, 6, 0.05, '강도');
    R(glow, c, 'glowPulse', 0, 1, 0.01, '숨결');
    R(glow, c, 'glowPulseSpeed', 0.1, 8, 0.05, '숨결 속도');
    glow.addColor(c, 'colorGlow').name('색상');

    const light = folder.addFolder('조명');
    R(light, c, 'lightIntensity', 0, 120, 0.5, '새');
    R(light, c, 'lightRadius', 1, 40, 0.1, '새 빛 반경');
    light.addColor(c, 'lightColor').name('조류 광원 색');
    R(light, c, 'lightGutter', 0, 1, 0.01, '홈');
    R(light, c, 'lightGutterSpeed', 0.5, 30, 0.1, '홈 속도');
    R(light, c, 'fieldLight', 0, 120, 0.5, '장작더미');
    R(light, c, 'fieldLightRadius', 1, 40, 0.1, '장작불 빛 반경');

    this.phoenixFolder = folder;
  }

  _buildMonowheel() {
    const folder = this.gui.addFolder('◎  외륜 봇');
    const c = settings.monowheel;
    const R = Editor.range;

    const cast = folder.addFolder('소환');
    R(cast, c, 'range', 2, 20, 0.1, '소멸 고리 반경 (m)');
    R(cast, c, 'cooldown', 0, 10, 0.05, '회수 후 쿨타임');
    R(cast, c, 'deployTime', 0.2, 4, 0.01, '전개 시간 (s)');
    R(cast, c, 'recallTime', 0.2, 4, 0.01, '회수 기간 (s)');
    R(cast, c, 'deployDistance', 0, 6, 0.05, '전방 출현 (m)');
    R(cast, c, 'deployShake', 0, 0.5, 0.005, '도착 진동');
    cast.add(c, 'watch').name('시전자가 주시');
    Editor.castAnimation(cast, c);

    const chassis = folder.addFolder('섀시');
    R(chassis, c, 'size', 0.5, 4, 0.01, '높이 (m)');
    chassis.addColor(c, 'rimColor').name('외곽 색');
    R(chassis, c, 'rimStrength', 0, 2, 0.01, '가장자리');
    R(chassis, c, 'rimPower', 0.5, 8, 0.05, '림 조임');
    chassis.addColor(c, 'revealColor').name('발자국 가장자리 색');
    R(chassis, c, 'revealWidth', 0.005, 0.5, 0.005, '자국 가장자리 (m)');
    R(chassis, c, 'revealGlow', 0, 20, 0.1, '자국 가장자리 광택');

    const balance = folder.addFolder('균형');
    R(balance, c, 'lean', 0, 0.8, 0.005, '속도 기울기 (rad)');
    R(balance, c, 'leanRate', 0.0001, 0.5, 0.0001, '기울기 지연');
    R(balance, c, 'bankIntoTurns', 0, 0.6, 0.005, '회전 기울기');
    R(balance, c, 'recoil', 0, 0.3, 0.002, '반동 흔들림 (rad)');
    R(balance, c, 'wobble', 0, 0.1, 0.001, '대기 흔들림 (rad)');
    R(balance, c, 'wobbleSpeed', 0, 6, 0.01, '흔들거림 속도');

    const drive = folder.addFolder('구동');
    R(drive, c, 'maxSpeed', 0.5, 20, 0.1, '최고 속도 (m/s)');
    R(drive, c, 'acceleration', 0.0005, 0.6, 0.0005, '스로틀 지연');
    R(drive, c, 'leash', 2, 40, 0.1, '줄 (m)');
    R(drive, c, 'turnRate', 0.0005, 0.6, 0.0005, '조향 지연');
    R(drive, c, 'stickDeadZone', 0, 0.5, 0.01, '스틱 데드존');
    R(drive, c, 'stickExpo', 0.5, 4, 0.05, '스틱 엑스포');
    R(drive, c, 'handDeadZone', 0, 0.8, 0.01, '손 데드존 (ndc)');
    R(drive, c, 'handFullRange', 0.1, 1, 0.01, '손 최대 기울기 (ndc)');
    R(drive, c, 'treadDust', 0, 160, 1, '궤도 먼지 (particles/s)');
    R(drive, c, 'treadDustSize', 0.1, 2.5, 0.01, '궤도 먼지 크기');

    const ring = folder.addFolder('사거리 링');
    R(ring, c, 'ringWidth', 0.02, 1, 0.005, '밴드 너비 (m)');
    R(ring, c, 'ringGlow', 0, 4, 0.01, '밴드 빛');
    R(ring, c, 'ringSoftness', 0.005, 0.4, 0.005, '부드러움');
    R(ring, c, 'ringFill', 0, 0.6, 0.005, '내부 번짐');
    R(ring, c, 'ringTicks', 0, 96, 1, '틱 수');
    R(ring, c, 'ringTickLength', 0, 1.2, 0.01, '틱 길이 (m)');
    R(ring, c, 'ringTickWidth', 0.02, 0.9, 0.01, '틱 듀티');
    R(ring, c, 'ringTickSpin', -0.5, 0.5, 0.005, '틱 회전 (rev/s)');
    R(ring, c, 'ringSweep', 0, 2, 0.01, '레이더 탐색');
    R(ring, c, 'ringSweepSpeed', 0, 2, 0.01, '휩쓸기 (rev/s)');
    R(ring, c, 'ringPulse', 0, 3, 0.01, '뜨거운 맥동');
    R(ring, c, 'ringOpacity', 0, 1, 0.01, '불투명도');
    ring.addColor(c, 'colorRing').name('주시 중');
    ring.addColor(c, 'colorRingHot').name('수색');

    const lamp = folder.addFolder('전조등');
    R(lamp, c, 'beamAngle', 1, 30, 0.1, '절반 각도 (deg)');
    R(lamp, c, 'beamIntensity', 0, 2, 0.01, '원뿔');
    R(lamp, c, 'beamEdge', 0.2, 6, 0.05, '가장자리 부드러움');
    R(lamp, c, 'beamFalloff', 0, 3, 0.01, '바닥으로 감쇠');
    R(lamp, c, 'beamNoise', 0, 1, 0.01, '빛 속 먼지');
    R(lamp, c, 'beamNoiseScale', 0.2, 8, 0.05, '먼지 규모');
    R(lamp, c, 'beamSwing', 0.0001, 0.5, 0.0001, '흔들림 지연');
    R(lamp, c, 'headlightReach', 0.5, 15, 0.1, '전방 조명 거리 (m)');
    R(lamp, c, 'spotIntensity', 0, 3, 0.01, '바닥 웅덩이');
    R(lamp, c, 'spotLight', 0, 40, 0.1, '바닥 조명');
    R(lamp, c, 'spotLightRadius', 0.5, 20, 0.1, '바닥 조명 반경');
    lamp.addColor(c, 'colorBeam').name('주시 중');
    lamp.addColor(c, 'colorBeamHot').name('수색');

    const hunt = folder.addFolder('조준');
    R(hunt, c, 'aimTurnRate', 0.0001, 0.5, 0.0001, '진입 지연');
    R(hunt, c, 'lockTime', 0.02, 3, 0.01, '고정 시간 (s)');
    R(hunt, c, 'lockCone', 0.02, 1.2, 0.01, '발사 범위 (rad)');
    R(hunt, c, 'aimHeight', 0, 1, 0.01, '몸 높이 조준');
    R(hunt, c, 'retarget', 0, 3, 0.01, '표적 간격 (s)');
    R(hunt, c, 'reticleSize', 0.2, 4, 0.01, '조준선 크기 (m)');
    R(hunt, c, 'reticleGlow', 0, 5, 0.01, '조준선 광택');
    hunt.addColor(c, 'colorReticle').name('고정 중');
    hunt.addColor(c, 'colorLocked').name('고정');

    const burst = folder.addFolder('폭발');
    R(burst, c, 'rounds', 1, 24, 1, '탄 수 (교대 사격)');
    R(burst, c, 'burstTime', 0.05, 2, 0.01, '기간 (s)');
    R(burst, c, 'tracerSpeed', 10, 200, 1, '추적광 속도 (m/s)');
    R(burst, c, 'tracerSize', 0.02, 0.4, 0.005, '추적광 너비 (m)');
    R(burst, c, 'tracerLength', 0.1, 6, 0.05, '추적광 길이 (m)');
    R(burst, c, 'spread', 0, 0.2, 0.001, '분산 (rad)');
    R(burst, c, 'muzzleSize', 0, 2, 0.01, '총구 섬광 중심 (m)');
    R(burst, c, 'muzzleLength', 0, 3, 0.01, '총구 불꽃 (m)');
    R(burst, c, 'muzzleStreaks', 0, 16, 1, '총구 불 줄무늬');
    R(burst, c, 'muzzleLight', 0, 200, 1, '총구 빛');
    burst.add(c, 'casings').name('탄피 배출');
    R(burst, c, 'impactSparks', 0, 80, 1, '충돌 불꽃');
    burst.add(c, 'scorch').name('바닥 그을리기');
    R(burst, c, 'fireShake', 0, 0.5, 0.005, '반동 진동');
    R(burst, c, 'fireFlash', 0, 0.4, 0.005, '화면 섬광');
    burst.addColor(c, 'colorTracer').name('예광탄');
    burst.addColor(c, 'colorTracerTail').name('예광탄 꼬리');
    burst.addColor(c, 'colorFlash').name('섬광');
    burst.addColor(c, 'colorSpark').name('불꽃');
    const hit = burst.addFolder('피격');
    R(hit, c.hit, 'impulse', 0, 20, 0.1, '투척 속도 (m/s)');
    R(hit, c.hit, 'lift', 0, 10, 0.1, '들어올림 (m/s)');
    R(hit, c.hit, 'spin', 0, 5, 0.05, '토크');

    const light = folder.addFolder('신체 조명');
    R(light, c, 'lightIntensity', 0, 60, 0.5, '강도');
    R(light, c, 'lightRadius', 0.5, 30, 0.1, '반경');
    light.addColor(c, 'lightColor').name('색상');

    this.monowheelFolder = folder;
  }

  /* ------------------------------------------------------------------ */

  /**
   * The Corrupted Shard Spawn.
   *
   * Grouped the way the reference sheet is: one folder per panel, in the order
   * they appear on screen — the rune is cut, the crystals tear up, the water is
   * thrown, the mist coils, the flash ignites, the droplets drift — and then a
   * seventh for the beam the flash fires, which is what the composite implies.
   * `The sequence` sits at the top because it reaches into all of them.
   *
   * `crystals` is the performance dial and is a live slider on purpose.
   */
  _buildShard() {
    const folder = this.gui.addFolder('✦  타락한 파편');
    const c = settings.shard;
    const R = Editor.range;

    const cast = folder.addFolder('시전');
    R(cast, c, 'zoneRadius', 1, 12, 0.05, '범위 반경');
    R(cast, c, 'range', 2, 50, 0.1, '최대 범위');
    R(cast, c, 'minRange', 0, 10, 0.1, '최소 범위');
    R(cast, c, 'speed', 5, 300, 1, '시드 속도');
    R(cast, c, 'lifetime', 0.5, 20, 0.05, '유지 시간');
    R(cast, c, 'fadeTime', 0.1, 8, 0.01, '사라지는 시간');
    R(cast, c, 'cooldown', 0, 10, 0.05, '쿨타임');
    Editor.castAnimation(cast, c);

    const sequence = folder.addFolder('순서');
    R(sequence, c, 'runeTime', 0.05, 2, 0.01, '룬 개방');
    R(sequence, c, 'crystalDelay', 0, 2, 0.01, '수정 시작점');
    R(sequence, c, 'crystalTime', 0.05, 3, 0.01, '하나 상승 기간');
    R(sequence, c, 'crystalStagger', 0, 2, 0.01, '처음-끝 지연');
    R(sequence, c, 'crystalOvershoot', 0, 0.5, 0.005, '상승 초과');
    R(sequence, c, 'crystalSettle', 0.05, 1.5, 0.01, '안정 시간');
    R(sequence, c, 'splashRise', 0.05, 1, 0.01, '왕관 상승');
    R(sequence, c, 'splashHold', 0, 1, 0.01, '왕관 유지');
    R(sequence, c, 'splashFall', 0.1, 3, 0.01, '왕관 낙하');
    R(sequence, c, 'mistDelay', 0, 2, 0.01, '안개 시작점');
    R(sequence, c, 'flareDelay', 0, 3, 0.01, '섬광 점화점');
    R(sequence, c, 'flareTime', 0.02, 2, 0.01, '섬광 조명');
    R(sequence, c, 'fireDelay', 0, 3, 0.01, '첫 광선 이후');
    R(sequence, c, 'pulseRate', 0.05, 6, 0.01, '맥동 속도');
    R(sequence, c, 'pulseDepth', 0, 2, 0.01, '맥동 깊이');

    /* ---- layer 1 ---- */
    const rune = folder.addFolder('1 · 지면 룬');
    R(rune, c, 'runeRailWidth', 0.005, 0.2, 0.001, '레일 너비 (m)');
    R(rune, c, 'runeRailOuter', 0.4, 1.4, 0.005, '바깥 레일');
    R(rune, c, 'runeRailTwin', 0.4, 1.3, 0.005, '쌍 궤도');
    R(rune, c, 'runeRailInner', 0.2, 1.2, 0.005, '안쪽 레일');
    R(rune, c, 'runeRailMid', 0.1, 1.0, 0.005, '별 궤도');
    R(rune, c, 'runeRailHub', 0.02, 0.6, 0.005, '중심');
    R(rune, c, 'runeRailGlow', 0, 6, 0.01, '레일 광택');
    R(rune, c, 'runeSpin', -0.2, 0.2, 0.001, '링 회전');
    R(rune, c, 'runeGlyphs', 6, 120, 1, '문양');
    R(rune, c, 'runeGlyphBand', 0.05, 1.2, 0.005, '밴드 높이 (m)');
    R(rune, c, 'runeGlyphSeat', 0.3, 1.3, 0.005, '밴드 위치');
    R(rune, c, 'runeGlyphWeight', 0.01, 0.2, 0.001, '획 굵기');
    R(rune, c, 'runeGlyphStrokes', 0, 1, 0.01, '유지 획 수');
    R(rune, c, 'runeGlyphSweep', 0, 4, 0.01, '읽기 머리');
    R(rune, c, 'runeGlyphSweepSpeed', -1, 1, 0.005, '머리 속도');
    R(rune, c, 'runeGlyphSweepWidth', 0.01, 0.5, 0.005, '머리 너비');
    R(rune, c, 'runeGlyphFlicker', 0, 1, 0.01, '문양 깜빡임');
    R(rune, c, 'runeGlyphGlow', 0, 6, 0.01, '문양 광택');
    R(rune, c, 'runeStar', 0, 4, 0.01, '육각별');
    R(rune, c, 'runeStarWidth', 0.005, 0.15, 0.001, '별 너비 (m)');
    R(rune, c, 'runeStarSpin', -0.2, 0.2, 0.001, '별 회전');
    R(rune, c, 'runeHex', 0, 4, 0.01, '육각형');
    R(rune, c, 'runeOrbits', 0, 4, 0.01, '끝점 원');
    R(rune, c, 'runeOrbitRadius', 0.02, 0.3, 0.005, '원 반경');
    R(rune, c, 'runeSpokes', 1, 24, 1, '살 수');
    R(rune, c, 'runeSpokeWidth', 0.004, 0.1, 0.001, '살 너비 (m)');
    R(rune, c, 'runeSpokeGlow', 0, 4, 0.01, '살 발광');
    R(rune, c, 'runeTicks', 0, 3, 0.01, '눈금');
    R(rune, c, 'runeTickCount', 4, 240, 1, '틱 수');
    R(rune, c, 'runeTickWidth', 0.02, 1, 0.01, '틱 너비');
    R(rune, c, 'runeTickLength', 0.005, 0.3, 0.005, '틱 길이');
    R(rune, c, 'runeWash', 0, 2, 0.01, '안쪽 번짐');
    R(rune, c, 'runeWashFalloff', 0.2, 6, 0.05, '번짐 감쇠');
    R(rune, c, 'runeGrain', 0, 2, 0.01, '번짐 입자');
    R(rune, c, 'runeGrainScale', 0.2, 10, 0.05, '입자 규모');
    R(rune, c, 'runeOpacity', 0, 2, 0.01, '불투명도');
    R(rune, c, 'runeGlow', 0, 3, 0.01, '광택');
    R(rune, c, 'runeHeight', 0.005, 0.2, 0.002, '공중 높이');
    rune.addColor(c, 'colorRune').name('선');
    rune.addColor(c, 'colorRuneCore').name('선 핵');
    rune.addColor(c, 'colorGlyph').name('문양');
    rune.addColor(c, 'colorRuneWash').name('내부 세광');
    rune.addColor(c, 'colorRuneFront').name('전면 개구부');

    /* ---- layer 2 ---- */
    const crystals = folder.addFolder('2 · 결정 파편');
    R(crystals, c, 'crystals', 1, 24, 1, '수정');
    R(crystals, c, 'spireHeight', 0.5, 8, 0.05, '첨탑 높이 (m)');
    R(crystals, c, 'bladeHeight', 0.3, 6, 0.05, '날 높이 (m)');
    R(crystals, c, 'shardHeight', 0.1, 3, 0.05, '파편 높이 (m)');
    R(crystals, c, 'crystalHeightJitter', 0, 1, 0.01, '높이 흔들림');
    R(crystals, c, 'crystalRadius', 0.05, 1.2, 0.01, '밑면 반경 (m)');
    R(crystals, c, 'crystalRadiusJitter', 0, 1, 0.01, '반경 흔들림');
    R(crystals, c, 'bladeSeat', 0.05, 1, 0.005, '날 링 범위 (배율)');
    R(crystals, c, 'shardSeat', 0.05, 1.2, 0.005, '파편 링·바닥');
    R(crystals, c, 'crystalSeatJitter', 0, 1, 0.01, '자리 흔들림');
    R(crystals, c, 'bladeLean', 0, 1.4, 0.01, '날 기울기 (rad)');
    R(crystals, c, 'shardLean', 0, 1.5, 0.01, '파편 기울기 (rad)');
    R(crystals, c, 'crystalLeanJitter', 0, 1, 0.01, '기울기 흔들림');
    R(crystals, c, 'crystalTwist', 0, 2, 0.01, '비틀림');
    R(crystals, c, 'crystalFacets', 4, 9, 1, '면');
    R(crystals, c, 'crystalTaper', 0.02, 0.6, 0.005, '끝 테이퍼');
    R(crystals, c, 'crystalRough', 0, 1, 0.01, '면 거칠기');
    R(crystals, c, 'crystalBend', 0, 0.8, 0.01, '휨');
    R(crystals, c, 'crystalSinkTime', 0.1, 4, 0.01, '후퇴');
    R(crystals, c, 'shatterChips', 0, 400, 1, '이탈 시 파편');

    const stone = folder.addFolder('2 · 석재 구성');
    R(stone, c, 'gemDepthTint', 0, 3, 0.01, '깊이 색조');
    R(stone, c, 'gemFresnel', 0, 5, 0.01, '림 이득');
    R(stone, c, 'gemFresnelPower', 0.5, 6, 0.05, '림 출력');
    R(stone, c, 'gemDispersion', 0, 1.5, 0.01, '분산');
    R(stone, c, 'gemFacetSharp', 0, 1, 0.01, '면 들뜸');
    R(stone, c, 'gemScreenKey', 0, 1, 0.01, '화면 키');
    R(stone, c, 'gemCleave', 0, 2, 0.01, '쪼개짐 면');
    R(stone, c, 'gemCleaveScale', 1, 20, 0.1, '쪼개짐 규모');
    R(stone, c, 'gemVein', 0, 5, 0.01, '오염 빛');
    R(stone, c, 'gemVeinScale', 0.5, 10, 0.05, '오염 규모');
    R(stone, c, 'gemVeinFlow', 0, 3, 0.01, '오염 상승');
    R(stone, c, 'gemVeinBase', 0, 1, 0.01, '끝 방향 가늘어짐');
    R(stone, c, 'gemVeinSharp', 0.5, 8, 0.05, '오염 선명도');
    R(stone, c, 'gemBaseDark', 0, 0.8, 0.005, '흑요석 밑동');
    R(stone, c, 'gemTipFrost', 0, 1, 0.01, '끝 서리');
    R(stone, c, 'gemTipStart', 0, 1, 0.01, '서리 시작점');
    R(stone, c, 'gemGlint', 0, 4, 0.01, '반짝임');
    R(stone, c, 'gemGlintScale', 4, 80, 0.5, '반짝 규모');
    R(stone, c, 'gemGlintSpeed', 0, 4, 0.01, '반짝임 이동');
    R(stone, c, 'gemGlow', 0, 3, 0.01, '발광 마스터');
    R(stone, c, 'gemEdgeGlow', 0, 4, 0.01, '가장자리 빛');
    R(stone, c, 'gemBodyGlow', 0, 2, 0.01, '몸통 빛');
    R(stone, c, 'gemBirthGlow', 0, 10, 0.05, '생성 섬광');
    R(stone, c, 'gemBirthFade', 0.05, 2, 0.01, '생성 열 식힘');
    R(stone, c, 'gemChargeGlow', 0, 8, 0.05, '충전 빛');
    R(stone, c, 'gemCoreBleed', 0, 5, 0.01, '섬광 점등');
    R(stone, c, 'gemCoreBleedRadius', 0.2, 12, 0.05, '섬광 도달');
    R(stone, c, 'gemOpacity', 0, 1, 0.01, '불투명도');
    R(stone, c, 'gemRoughness', 0, 1, 0.01, '거칠기');
    R(stone, c, 'gemEnv', 0, 3, 0.01, '반사');
    stone.addColor(c, 'colorGem').name('본체');
    stone.addColor(c, 'colorGemDeep').name('심층 본체');
    stone.addColor(c, 'colorGemRim').name('외곽');
    stone.addColor(c, 'colorVein').name('타락');
    stone.addColor(c, 'colorGemTip').name('끝단 서리');
    stone.addColor(c, 'colorGemBase').name('흑요석 발판');

    /* ---- layer 3 ---- */
    const splash = folder.addFolder('3 · 방사형 물보라');
    R(splash, c, 'splashRadius', 0.1, 1.2, 0.005, '왕관 위치 (배율)');
    R(splash, c, 'splashHeight', 0.1, 5, 0.05, '왕관 높이 (m)');
    R(splash, c, 'splashFingers', 4, 60, 1, '손가락');
    R(splash, c, 'splashFingerDepth', 0, 1, 0.01, '손가락 깊이');
    R(splash, c, 'splashFlare', 0, 1, 0.01, '선 기울기');
    R(splash, c, 'splashLean', 0, 3, 0.01, '낙하 기울기');
    R(splash, c, 'splashCurl', 0, 0.6, 0.01, '끝 말림');
    R(splash, c, 'splashWobble', 0, 0.3, 0.005, '벽 흔들림');
    R(splash, c, 'splashWobbleScale', 0.5, 6, 0.05, '흔들림 크기');
    R(splash, c, 'splashTear', 0, 1, 0.01, '마루 찢김');
    R(splash, c, 'splashFresnel', 0, 4, 0.01, '림 이득');
    R(splash, c, 'splashOpacity', 0, 1, 0.01, '불투명도');
    R(splash, c, 'splashGlow', 0, 3, 0.01, '광택');
    R(splash, c, 'splashRipple', 0.2, 3, 0.01, '바닥 링 범위 (배율)');
    R(splash, c, 'splashDrops', 0, 600, 1, '물방울');
    R(splash, c, 'splashDropSpeed', 0.5, 16, 0.1, '물방울 속도');
    R(splash, c, 'splashDropSize', 0.02, 0.4, 0.005, '물방울 크기');
    R(splash, c, 'splashDropLife', 0.2, 4, 0.05, '물방울 수명');
    splash.addColor(c, 'colorWater').name('물');
    splash.addColor(c, 'colorWaterDeep').name('심층수');
    splash.addColor(c, 'colorWaterRim').name('외곽');
    splash.addColor(c, 'colorWaterCrest').name('볏');
    Editor.gradient(splash, c, 'colorDrop', '물방울 그라데이션');

    /* ---- layer 4 ---- */
    const mist = folder.addFolder('4 · 어둠 안개 촉수');
    R(mist, c, 'mistRate', 0, 120, 1, '비율');
    R(mist, c, 'mistSize', 0.1, 4, 0.05, '크기');
    R(mist, c, 'mistLifetime', 0.3, 8, 0.05, '수명');
    R(mist, c, 'mistSpeed', 0, 4, 0.05, '속도');
    R(mist, c, 'mistRise', -1, 3, 0.05, '상승');
    R(mist, c, 'mistSwirl', -4, 4, 0.05, '코일 속도');
    R(mist, c, 'mistSwirlExpand', 0, 2, 0.01, '코일 확장');
    R(mist, c, 'mistOpacity', 0, 1, 0.01, '불투명도');
    R(mist, c, 'mistTurbulence', 0, 3, 0.01, '난류');
    R(mist, c, 'mistBurst', 0, 300, 1, '바닥 붕괴 분출');
    Editor.gradient(mist, c, 'colorMist', '안개 그라데이션');

    /* ---- layer 5 ---- */
    const flare = folder.addFolder('5 · 섬광');
    R(flare, c, 'flareHeight', 0.2, 6, 0.05, '높이 (m)');
    R(flare, c, 'flareSize', 0.2, 8, 0.05, '크기 (m)');
    R(flare, c, 'flareCore', 0, 3, 0.01, '흰 점');
    R(flare, c, 'flareCoreSize', 0.02, 0.5, 0.005, '점 크기');
    R(flare, c, 'flareRays', 0, 3, 0.01, '긴 광선');
    R(flare, c, 'flareRayLength', 0.1, 1.2, 0.01, '광선 길이');
    R(flare, c, 'flareRaySharp', 0.5, 12, 0.1, '광선 선명도');
    R(flare, c, 'flareDiagonals', 0, 2, 0.01, '대각 광선');
    R(flare, c, 'flareStreak', 0, 3, 0.01, '렌즈 줄무늬');
    R(flare, c, 'flareStreakLength', 0.1, 1.2, 0.01, '궤적 길이');
    R(flare, c, 'flareHalo', 0, 3, 0.01, '후광');
    R(flare, c, 'flareHaloFalloff', 0.5, 8, 0.05, '후광 감쇠');
    R(flare, c, 'flareRing', 0, 2, 0.01, '링');
    R(flare, c, 'flareRingRadius', 0.1, 1, 0.01, '링 반경');
    R(flare, c, 'flareSpin', -0.5, 0.5, 0.005, '광선 회전');
    R(flare, c, 'flareFlicker', 0, 1, 0.01, '깜빡임');
    R(flare, c, 'flareChargeGain', 0, 4, 0.05, '충전 팽창');
    R(flare, c, 'flareIgnite', 0, 8, 0.05, '점화 폭발');
    R(flare, c, 'flareIntensity', 0, 6, 0.05, '강도');
    R(flare, c, 'flareOpacity', 0, 1, 0.01, '불투명도');
    flare.addColor(c, 'colorFlareCore').name('지점');
    flare.addColor(c, 'colorFlareGlow').name('광선');
    flare.addColor(c, 'colorFlareHalo').name('후광');
    flare.addColor(c, 'colorFlareStreak').name('줄무늬');

    /* ---- layer 6 ---- */
    const beads = folder.addFolder('6 · 타락한 물방울');
    R(beads, c, 'beadRate', 0, 120, 1, '구슬 비율');
    R(beads, c, 'beadSize', 0.02, 0.4, 0.005, '구슬 크기');
    R(beads, c, 'beadLifetime', 0.3, 8, 0.05, '구슬 수명');
    R(beads, c, 'beadSpeed', 0, 4, 0.05, '구슬 속도');
    R(beads, c, 'beadRise', -2, 3, 0.05, '구슬 상승');
    R(beads, c, 'beadSwirl', -4, 4, 0.05, '구슬 회전 표류');
    R(beads, c, 'beadBurst', 0, 400, 1, '점화 시 구슬');
    R(beads, c, 'glintRate', 0, 120, 1, '반짝임 비율');
    R(beads, c, 'glintSize', 0.02, 0.3, 0.005, '반짝 크기');
    R(beads, c, 'glintLifetime', 0.2, 5, 0.05, '반짝임 지속');
    Editor.gradient(beads, c, 'colorBead', '구슬 그라데이션');
    Editor.gradient(beads, c, 'colorGlint', '반짝이 그라데이션');

    /* ---- the beam ---- */
    const beam = folder.addFolder('7 · 빔');
    beam.add(c, 'laserEnabled').name('발사');
    R(beam, c, 'laserRange', 1, 30, 0.1, '범위 (m)');
    R(beam, c, 'laserInterval', 0.05, 4, 0.01, '간격');
    R(beam, c, 'laserWarmup', 0, 2, 0.01, '예열');
    R(beam, c, 'laserVolley', 1, 6, 1, '발사당 목표 수');
    R(beam, c, 'laserLife', 0.1, 2, 0.01, '화면 표시 시간');
    R(beam, c, 'laserWidth', 0.1, 4, 0.05, '두께');
    R(beam, c, 'laserAim', 0, 1, 0.01, '몸 위쪽 조준');
    R(beam, c, 'laserShake', 0, 2, 0.01, '흔들림');
    R(beam, c, 'laserFlash', 0, 2, 0.01, '섬광');
    R(beam, c.laserHit, 'impulse', 0, 20, 0.1, '뒤로 불기');
    R(beam, c.laserHit, 'lift', 0, 12, 0.1, '위로 불기');
    R(beam, c.laserHit, 'spin', 0, 5, 0.05, '회전 불기');
    R(beam, c, 'impactBeads', 0, 300, 1, '상처에서 나오는 구슬');
    R(beam, c, 'impactGlints', 0, 300, 1, '빠져나오는 반짝임');
    R(beam, c, 'impactScorch', 0, 3, 0.05, '아래 표시 (m)');

    const burn = folder.addFolder('7 · 빛이 태우는 것');
    const bc = c.burn;
    burn.add(bc, 'enabled').name('신체 소각');
    R(burn, bc, 'stain', 0.1, 8, 0.05, '초당 보라 침투');
    R(burn, bc, 'onset', 0, 4, 0.01, '살이 뒤따름');
    R(burn, bc, 'rate', 0.05, 6, 0.01, '초당 타는 몸통');
    R(burn, bc.look, 'rimEmissive', 0, 8, 0.05, '탄 가장자리 빛');
    R(burn, bc.look, 'edgeEmissive', 0, 16, 0.05, '탄선 빛');
    R(burn, bc.look, 'edgeWidth', 0.005, 0.4, 0.005, '탄선 너비');
    burn.addColor(bc.look, 'color').name('탄 살점');
    burn.addColor(bc.look, 'rimColor').name('탄 가장자리');
    burn.addColor(bc.look, 'edgeColor').name('연소 선');

    const shape = folder.addFolder('7 · 빔 본체');
    R(shape, c, 'beamRadius', 0.01, 0.5, 0.005, '목표 지점 반경 (m)');
    R(shape, c, 'beamMuzzleRadius', 0.01, 0.8, 0.005, '섬광 지점 반경 (m)');
    R(shape, c, 'beamRadiusCurve', 0.1, 3, 0.05, '테이퍼 곡선');
    R(shape, c, 'beamFlare', 0, 3, 0.01, '표적 플레어');
    R(shape, c, 'beamFlareWidth', 0.01, 0.6, 0.005, '플레어 길이');
    R(shape, c, 'beamRipple', 0, 0.6, 0.005, '잔물결');
    R(shape, c, 'beamRippleBands', 1, 24, 1, '잔물결 띠');
    R(shape, c, 'beamRippleSpeed', 0, 20, 0.1, '잔물결 속도');
    R(shape, c, 'beamStrike', 0.02, 0.6, 0.005, '도착 시간');
    R(shape, c, 'beamHold', 0.05, 0.95, 0.005, '유지 종료점');
    R(shape, c, 'beamCoreFill', 0.2, 8, 0.05, '중심 무게');
    R(shape, c, 'beamEdgePower', 0.2, 8, 0.05, '외피 출력');
    R(shape, c, 'beamSheath', 0, 3, 0.01, '외피 이득');
    R(shape, c, 'beamPulse', 0, 4, 0.01, '질주 돌격');
    R(shape, c, 'beamPulseBands', 1, 24, 1, '충전 밴드');
    R(shape, c, 'beamPulseSpeed', 0, 30, 0.1, '충전 속도');
    R(shape, c, 'beamPulseSharp', 1, 20, 0.5, '충전 선명도');
    R(shape, c, 'beamHeadGlow', 0, 8, 0.05, '머리 광택');
    R(shape, c, 'beamHeadWidth', 0.01, 0.4, 0.005, '머리 너비');
    R(shape, c, 'beamMuzzleGlow', 0, 8, 0.05, '총구 광택');
    R(shape, c, 'beamMuzzleWidth', 0.01, 0.4, 0.005, '총구 너비');
    R(shape, c, 'beamIntensity', 0, 8, 0.05, '강도');
    R(shape, c, 'beamOpacity', 0, 1, 0.01, '불투명도');
    R(shape, c, 'beamSoftFade', 0.02, 2, 0.01, '부드러운 소멸');
    shape.addColor(c, 'colorBeamCore').name('핵');
    shape.addColor(c, 'colorBeamInner').name('내부');
    shape.addColor(c, 'colorBeamOuter').name('외피');
    shape.addColor(c, 'colorBeamPulse').name('충전');

    const impact = folder.addFolder('투척·점화·유지');
    R(impact, c, 'handHeight', 0, 3, 0.01, '손 높이');
    R(impact, c, 'handForward', -1, 3, 0.01, '손 앞쪽');
    R(impact, c, 'handSide', -1.5, 1.5, 0.01, '손 좌우');
    R(impact, c, 'muzzleSize', 0.05, 6, 0.05, '총구 크기');
    R(impact, c, 'muzzleIntensity', 0, 5, 0.01, '총구 강도');
    R(impact, c, 'castFlash', 0, 2, 0.01, '발사 시 섬광');
    R(impact, c, 'seedBeads', 0, 200, 1, '손에서 나오는 구슬');
    R(impact, c, 'creepRate', 0, 200, 1, '시드에서 나오는 구슬');
    R(impact, c, 'igniteFlash', 0, 2, 0.01, '점화 섬광');
    R(impact, c, 'igniteShake', 0, 3, 0.01, '착지 흔들림');
    R(impact, c, 'shakeDuration', 0.1, 4, 0.01, '흔들림 지속');
    R(impact, c, 'holdShake', 0, 0.5, 0.005, '유지 진동');
    R(impact, c, 'rumble', 0, 0.5, 0.005, '기는 진동');
    R(impact, c, 'stainLife', 0.5, 20, 0.1, '바닥 자국 수명');
    R(impact, c, 'stainIntensity', 0, 2, 0.01, '바닥 자국 강도');
    impact.addColor(c, 'colorBurstA').name('껍질 내부');
    impact.addColor(c, 'colorBurstB').name('껍질 중간');
    impact.addColor(c, 'colorBurstC').name('껍질 핵');
    impact.addColor(c, 'colorScorch').name('바닥 자국');
    impact.addColor(c, 'colorScorchEdge').name('바닥 자국 가장자리');
    impact.addColor(c, 'colorCastFlash').name('방출 섬광');
    impact.addColor(c, 'colorFlash').name('빔 섬광');

    const light = folder.addFolder('동적 조명');
    R(light, c, 'lightIntensity', 0, 120, 0.5, '빛 강도');
    R(light, c, 'lightRadius', 0.5, 50, 0.1, '빛 반경');
    R(light, c, 'lightHeight', 0, 1, 0.01, '바닥부터 섬광 높이');
    R(light, c, 'lightPulse', 0, 1, 0.01, '맥동 소유');
    light.addColor(c, 'lightColor').name('조명 색');

    this.shardFolder = folder;
  }

  /**
   * The Glacial Prison, in the order the sheet stacks it: the ice cylinder,
   * the frost in the air, the ground ice, the cold mist, the crystals, the
   * glow — then what it does to a body, the ice every layer is made of, and
   * the light. It lands where it is aimed on the frame it is cast; there is
   * no arriving to dial.
   */
  _buildFrost() {
    const folder = this.gui.addFolder('❄️  빙결 감옥');
    const c = settings.frost;
    const R = Editor.range;

    const cast = folder.addFolder('시전');
    R(cast, c, 'zoneRadius', 1, 8, 0.05, '감옥 반경 (m)');
    R(cast, c, 'range', 4, 50, 0.1, '최대 범위');
    R(cast, c, 'minRange', 0, 12, 0.1, '최소 범위');
    R(cast, c, 'lifetime', 1, 30, 0.1, '유지 시간 (s)');
    R(cast, c, 'fadeTime', 0.1, 8, 0.01, '해동 시간 (s)');
    R(cast, c, 'cooldown', 0, 15, 0.05, '쿨타임');
    Editor.castAnimation(cast, c);

    const landing = folder.addFolder('착륙');
    R(landing, c, 'landShake', 0, 1.5, 0.005, '흔들림');
    R(landing, c, 'landLight', 0, 300, 1, '빛 타격');
    R(landing, c, 'landGlints', 0, 800, 1, '위로 튀는 반짝임');
    R(landing, c, 'landMotes', 0, 500, 1, '가장자리 서리');

    /* ---- panel 1 ---- */
    const wall = folder.addFolder('1 · 얼음 기둥 메시');
    R(wall, c, 'wallDelay', 0, 1, 0.01, '정지 시점 (s)');
    R(wall, c, 'wallRiseTime', 0.05, 3, 0.01, '상승 시간 (s)');
    R(wall, c, 'wallHeight', 0.5, 12, 0.1, '높이 (m)');
    R(wall, c, 'wallOpacity', 0, 1, 0.01, '불투명도');
    R(wall, c, 'wallBody', 0, 1, 0.01, '투명 얼음 몸통');
    R(wall, c, 'wallTopFade', 0.1, 1, 0.01, '가늘어짐 (높이 대비)');
    R(wall, c, 'wallRimPower', 0.5, 6, 0.05, '프레넬');
    R(wall, c, 'wallRimGlow', 0, 3, 0.01, '림 조명');
    R(wall, c, 'wallFrostScale', 0.2, 5, 0.01, '서리 규모');
    R(wall, c, 'wallFrost', 0, 1.5, 0.01, '서리 낌');
    R(wall, c, 'wallStriaScale', 0.2, 6, 0.05, '줄무늬 크기');
    R(wall, c, 'wallFlow', 0, 3, 0.01, '물결빛 상승 (m/s)');
    R(wall, c, 'wallCaustic', 0, 2, 0.01, '물결빛');
    R(wall, c, 'wallFootGlow', 0, 3, 0.01, '밑부분 점등');
    R(wall, c, 'wallCracks', 0, 1.5, 0.01, '실금');
    R(wall, c, 'wallRefraction', 0, 2, 0.01, '굴절');

    /* ---- panel 2 ---- */
    const air = folder.addFolder('2 · 서리 입자');
    R(air, c, 'glintRate', 0, 400, 1, '초당 반짝임');
    R(air, c, 'glintSize', 0.01, 0.4, 0.005, '반짝 크기');
    R(air, c, 'glintLife', 0.2, 8, 0.05, '반짝임 수명 (s)');
    R(air, c, 'glintRise', -2, 4, 0.05, '반짝 상승');
    R(air, c, 'glintGlow', 0, 6, 0.05, '반짝 광택');
    R(air, c, 'moteRate', 0, 300, 1, '눈/초');
    R(air, c, 'moteSize', 0.01, 0.3, 0.005, '눈 크기');
    R(air, c, 'moteLife', 0.2, 8, 0.05, '눈 수명 (s)');
    R(air, c, 'moteFall', -4, 2, 0.05, '눈 내림');

    /* ---- panel 3 ---- */
    const floor = folder.addFolder('3 · 지면 얼음 데칼');
    R(floor, c, 'floorReach', 1, 2.5, 0.01, '서리 도달 (× radius)');
    R(floor, c, 'floorFreezeTime', 0.05, 2, 0.01, '결빙 시간 (s)');
    R(floor, c, 'floorOpacity', 0, 1, 0.01, '시트 농도');
    R(floor, c, 'floorFrost', 0, 1, 0.01, '서리 불투명도');
    R(floor, c, 'floorFrostScale', 0.2, 5, 0.01, '서리 규모');
    R(floor, c, 'crackScale', 0.2, 4, 0.01, '미터당 균열 셀');
    R(floor, c, 'crackWidth', 0.005, 0.15, 0.001, '균열 너비 (m)');
    R(floor, c, 'crackGlow', 0, 6, 0.05, '균열 광');
    R(floor, c, 'crackDepth', 0, 0.5, 0.005, '균열 깊이 (m)');
    R(floor, c, 'spokes', 0, 24, 1, '방사형 균열');
    R(floor, c, 'footGlow', 0, 4, 0.05, '발 링');
    R(floor, c, 'floorSparkle', 0, 3, 0.01, '반짝이');
    R(floor, c, 'floorPulse', 0, 1, 0.01, '숨결');

    /* ---- panel 4 ---- */
    const mist = folder.addFolder('4 · 냉기 안개');
    R(mist, c, 'mistRate', 0, 120, 1, '비율');
    R(mist, c, 'mistDelay', 0, 2, 0.01, '시작 시점 (s)');
    R(mist, c, 'mistSize', 0.1, 4, 0.05, '크기');
    R(mist, c, 'mistLifetime', 0.3, 8, 0.05, '수명');
    R(mist, c, 'mistSpeed', 0, 4, 0.05, '전개 속도 (m/s)');
    R(mist, c, 'mistRise', -1, 3, 0.05, '상승');
    R(mist, c, 'mistSwirl', -4, 4, 0.05, '코일 속도');
    R(mist, c, 'mistSwirlExpand', 0, 2, 0.01, '코일 확장');
    R(mist, c, 'mistOpacity', 0, 1, 0.01, '불투명도');
    R(mist, c, 'mistTurbulence', 0, 3, 0.01, '난류');
    R(mist, c, 'mistBurst', 0, 300, 1, '바닥 결빙 분출');
    Editor.gradient(mist, c, 'colorMist', '안개 그라데이션');

    /* ---- panel 5 ---- */
    const shards = folder.addFolder('5 · 솟구치는 파편');
    const risers = shards.addFolder('공중');
    R(risers, c, 'shardCount', 0, 72, 1, '파편 수');
    R(risers, c, 'shardDelay', 0, 3, 0.01, '상승 시작 (s)');
    R(risers, c, 'shardSize', 0.02, 0.6, 0.005, '크기 (m)');
    R(risers, c, 'shardRise', 0, 3, 0.01, '상승 (m/s)');
    R(risers, c, 'shardLife', 0.5, 10, 0.05, '공중 시간 (s)');
    R(risers, c, 'shardSpin', 0, 6, 0.05, '텀블링 (rad/s)');
    const crown = shards.addFolder('벽 밑단');
    R(crown, c, 'crownCount', 0, 48, 1, '수정');
    R(crown, c, 'crownDelay', 0, 2, 0.01, '자람 시점 (s)');
    R(crown, c, 'crownGrowTime', 0.05, 3, 0.01, '자람 기간 (s)');
    R(crown, c, 'crownHeight', 0.1, 3, 0.01, '높이 (m)');
    R(crown, c, 'crownBase', 0.02, 0.6, 0.005, '밑면 반경 (m)');
    R(crown, c, 'crownRadius', 0.5, 1.3, 0.01, '위치 (× radius)');
    R(crown, c, 'crownLean', -0.5, 1, 0.01, '바깥 기울기 (rad)');
    const crystal = shards.addFolder('결정');
    R(crystal, c, 'crystalOpacity', 0, 1, 0.01, '불투명도');
    R(crystal, c, 'crystalScreenKey', 0, 1, 0.01, '주광 카메라 쪽으로');
    R(crystal, c, 'crystalInclusions', 0.5, 15, 0.1, '내포물 규모');
    R(crystal, c, 'crystalRim', 0, 3, 0.01, '림 조명');

    /* ---- panel 6 ---- */
    const glow = folder.addFolder('6 · 환경 광택');
    R(glow, c, 'glowRadius', 0.2, 3, 0.01, '도달 (× radius)');
    R(glow, c, 'glowHeight', 0, 4, 0.01, '높이 (m)');
    R(glow, c, 'glowIntensity', 0, 3, 0.01, '강도');
    R(glow, c, 'glowPulse', 0, 1, 0.01, '숨결');
    R(glow, c, 'glowPulseSpeed', 0.1, 8, 0.05, '숨결 속도');

    /* ---- the bodies ---- */
    const bodies = folder.addFolder('빙결된 신체');
    const freeze = bodies.addFolder('동결');
    R(freeze, c, 'freezeReach', 0.2, 2, 0.01, '도달 (× radius)');
    R(freeze, c, 'freezeDelay', 0, 2, 0.01, '첫 개체 (s)');
    R(freeze, c, 'freezeStagger', 0, 2, 0.01, '바깥 천체 지연 (s)');
    R(freeze, c, 'freezeTime', 0.05, 3, 0.01, '서리 상승 (s)');
    R(freeze, c, 'holdTime', 0, 10, 0.05, '얼음 유지 (s)');
    R(freeze, c, 'crackTime', 0.05, 3, 0.01, '균열 진행 (s)');
    R(freeze, c, 'bodyCrackWidth', 0.002, 0.08, 0.001, '균열 너비 (m)');
    R(freeze, c, 'crackGlowBody', 0, 10, 0.05, '균열 광');
    const shatter = bodies.addFolder('파쇄');
    R(shatter, c, 'shatterChunks', 4, 48, 1, '조각');
    R(shatter, c, 'shatterGap', 0, 0.05, 0.001, '조각 사이 간격 (m)');
    R(shatter, c, 'shatterSpeed', 0, 10, 0.05, '투척 속도 (m/s)');
    R(shatter, c, 'shatterLift', 0, 10, 0.05, '솟구침 (m/s)');
    R(shatter, c, 'shatterOut', 0, 3, 0.01, '원 바깥');
    R(shatter, c, 'shatterSpin', 0, 25, 0.1, '텀블링 (rad/s)');
    R(shatter, c, 'shatterGravity', -30, -2, 0.1, '중력');
    R(shatter, c, 'shatterBounce', 0, 0.9, 0.01, '튐');
    R(shatter, c, 'shatterFriction', 0, 1, 0.01, '마찰');
    R(shatter, c, 'shatterChips', 0, 500, 1, '파편 수');
    R(shatter, c, 'chipSize', 0.01, 0.3, 0.005, '파편 크기');
    R(shatter, c, 'shatterLight', 0, 200, 1, '빛 타격');
    R(shatter, c, 'shatterShake', 0, 1, 0.005, '흔들림');
    const melt = bodies.addFolder('융해');
    R(melt, c, 'meltDelay', 0, 10, 0.05, '조각 유지 (s)');
    R(melt, c, 'meltTime', 0.1, 6, 0.05, '녹는 기간 (s)');
    R(melt, c, 'meltVapour', 0, 80, 1, '수증기/초');
    const statue = bodies.addFolder('신체의 얼음');
    R(statue, c, 'bodyFrostScale', 1, 30, 0.1, '서리 규모');
    R(statue, c, 'iceRough', 0, 1, 0.01, '투명 거칠기');
    R(statue, c, 'frostRough', 0, 1, 0.01, '서리 거칠기');
    R(statue, c, 'iceGlow', 0, 3, 0.01, '내부 차가운 빛');
    R(statue, c, 'iceRim', 0, 4, 0.01, '스치는 순간');
    R(statue, c, 'iceClearcoat', 0, 1, 0.01, '유리 코팅');
    R(statue, c, 'iceEnv', 0, 4, 0.05, '반사');

    /* ---- what everything is made of ---- */
    const ice = folder.addFolder('얼음');
    ice.addColor(c, 'colorDeep').name('심층');
    ice.addColor(c, 'colorIce').name('얼음');
    ice.addColor(c, 'colorFrost').name('서리');
    ice.addColor(c, 'colorGlow').name('냉광');
    R(ice, c, 'envStrength', 0, 3, 0.05, '반사');
    R(ice, c, 'sunSpec', 0, 4, 0.05, '태양 하이라이트');

    const light = folder.addFolder('조명');
    R(light, c, 'lightIntensity', 0, 200, 0.5, '강도');
    R(light, c, 'lightRadius', 1, 50, 0.1, '반경');
    light.addColor(c, 'lightColor').name('색상');

    this.frostFolder = folder;
  }

  /**
   * The Toxic Shield of Conquest, in the order the sheet stacks it: the
   * crystalline barrier, the poison gas, the ground rupture, the shockwave —
   * then what it does to a body, the glass every layer is made of, and the
   * light. It lands where it is aimed on the frame it is cast; there is no
   * arriving to dial.
   */
  _buildToxic() {
    const folder = this.gui.addFolder('☣️  맹독 방벽');
    const c = settings.toxic;
    const R = Editor.range;

    const cast = folder.addFolder('시전');
    R(cast, c, 'zoneRadius', 1, 8, 0.05, '장벽 반경 (m)');
    R(cast, c, 'range', 4, 50, 0.1, '최대 범위');
    R(cast, c, 'minRange', 0, 12, 0.1, '최소 범위');
    R(cast, c, 'lifetime', 1, 30, 0.1, '유지 시간 (s)');
    R(cast, c, 'fadeTime', 0.1, 8, 0.01, '분해 시간 (s)');
    R(cast, c, 'cooldown', 0, 15, 0.05, '쿨타임');
    Editor.castAnimation(cast, c);

    const landing = folder.addFolder('착륙');
    R(landing, c, 'landShake', 0, 1.5, 0.005, '흔들림');
    R(landing, c, 'landLight', 0, 300, 1, '빛 타격');
    R(landing, c, 'landSpores', 0, 800, 1, '솟아오른 포자');

    /* ---- panel 1 ---- */
    const dome = folder.addFolder('1 · 결정 방벽 메시');
    R(dome, c, 'domeDelay', 0, 1, 0.01, '정지 시점 (s)');
    R(dome, c, 'domeRiseTime', 0.05, 3, 0.01, '조립 시간 (s)');
    R(dome, c, 'domeSink', 0, 0.9, 0.01, '바닥 박힘');
    R(dome, c, 'domeSpin', -0.5, 0.5, 0.005, '격자 회전 (rad/s)');
    R(dome, c, 'domeOpacity', 0, 1, 0.01, '불투명도');
    R(dome, c, 'domeBody', 0, 1, 0.01, '투명 유리 몸통');
    R(dome, c, 'domeRimPower', 0.5, 6, 0.05, '프레넬');
    R(dome, c, 'domeRimGlow', 0, 3, 0.01, '림 조명');
    R(dome, c, 'domeFootGlow', 0, 3, 0.01, '밑부분 점등');
    R(dome, c, 'domeRefraction', 0, 2, 0.01, '굴절');
    const spars = dome.addFolder('격자');
    R(spars, c, 'sparCount', 0, 28, 1, '스파 수');
    R(spars, c, 'sparWidth', 0.002, 0.05, 0.001, '두께');
    R(spars, c, 'sparMinArc', 0.1, 3.14, 0.01, '최단 호 (rad)');
    R(spars, c, 'sparMaxArc', 0.1, 3.14, 0.01, '가장 긴 호 (rad)');
    R(spars, c, 'sparGlow', 0, 5, 0.05, '광택');
    R(spars, c, 'sparSpeed', 0, 10, 0.05, '빛 속도');
    R(spars, c, 'cellScale', 0.5, 10, 0.05, '반경당 면');
    R(spars, c, 'cellWidth', 0.005, 0.15, 0.001, '면 이음 너비');
    R(spars, c, 'cellGlow', 0, 2, 0.01, '면 이음 빛');
    const poison = dome.addFolder('내부의 독');
    R(poison, c, 'domeSwirl', 0, 2, 0.01, '소용돌이');
    R(poison, c, 'domeSwirlScale', 0.3, 8, 0.05, '소용돌이 크기');
    R(poison, c, 'domeSwirlSpeed', 0, 1, 0.005, '소용돌이 속도');

    /* ---- panel 2 ---- */
    const gas = folder.addFolder('2 · 독가스 장막');
    R(gas, c, 'gasRate', 0, 120, 1, '비율');
    R(gas, c, 'gasDelay', 0, 2, 0.01, '시작 시점 (s)');
    R(gas, c, 'gasRadius', 0.3, 1.5, 0.01, '생성 위치 (× radius)');
    R(gas, c, 'gasSize', 0.1, 4, 0.05, '크기');
    R(gas, c, 'gasLifetime', 0.3, 8, 0.05, '수명');
    R(gas, c, 'gasSpeed', 0, 4, 0.05, '스며나옴 (m/s)');
    R(gas, c, 'gasRise', -1, 3, 0.05, '상승');
    R(gas, c, 'gasSwirl', -4, 4, 0.05, '코일 속도');
    R(gas, c, 'gasSwirlExpand', 0, 2, 0.01, '코일 확장');
    R(gas, c, 'gasOpacity', 0, 1, 0.01, '불투명도');
    R(gas, c, 'gasTurbulence', 0, 3, 0.01, '난류');
    R(gas, c, 'gasBurst', 0, 300, 1, '바닥 붕괴 분출');
    Editor.gradient(gas, c, 'colorGas', '가스 그라데이션');
    const spores2 = gas.addFolder('포자');
    R(spores2, c, 'sporeRate', 0, 400, 1, '포자/초');
    R(spores2, c, 'sporeSize', 0.01, 0.4, 0.005, '크기');
    R(spores2, c, 'sporeLife', 0.2, 8, 0.05, '수명 (s)');
    R(spores2, c, 'sporeRise', -2, 4, 0.05, '상승');
    R(spores2, c, 'sporeGlow', 0, 6, 0.05, '광택');

    /* ---- panel 3 ---- */
    const crust = folder.addFolder('3 · 지면 균열 데칼');
    R(crust, c, 'plateReach', 0.5, 1.6, 0.01, '도달 (× radius)');
    R(crust, c, 'plateCells', 8, 120, 1, '판 수');
    R(crust, c, 'plateDepth', 0.02, 0.4, 0.005, '판 깊이');
    R(crust, c, 'plateRagged', 0, 0.6, 0.01, '들쭉날쭉 가장자리');
    R(crust, c, 'plateBias', 0.2, 1, 0.01, '셀 치우침');
    R(crust, c, 'plateBreakTime', 0.05, 2, 0.01, '분해 시간 (s)');
    R(crust, c, 'plateGap', 0, 0.3, 0.005, '이음 틈');
    R(crust, c, 'plateHeave', 0, 0.4, 0.005, '솟구침');
    R(crust, c, 'plateTilt', 0, 1, 0.01, '기울기 (rad)');
    R(crust, c, 'plateRumble', 0, 0.1, 0.001, '떨림 (m)');
    R(crust, c, 'plateWallDark', 0, 1, 0.01, '벽 그늘');
    const venom = crust.addFolder('내부의 맹독');
    R(venom, c, 'seamGlow', 0, 10, 0.05, '이음 빛');
    R(venom, c, 'crustCrackScale', 0.3, 8, 0.05, '미터당 균열');
    R(venom, c, 'crustCrackWidth', 0.005, 0.2, 0.001, '균열 너비');
    R(venom, c, 'crustCrackGlow', 0, 8, 0.05, '균열 광');
    R(venom, c, 'crustCrackReach', 0.1, 1, 0.01, '균열 도달');
    R(venom, c, 'crustStain', 0, 1, 0.01, '얼룩');
    venom.addColor(c, 'colorStain').name('얼룩 색');
    R(venom, c, 'crustPulse', 0, 1, 0.01, '숨결');
    R(venom, c, 'crustPulseSpeed', 0.1, 8, 0.05, '숨결 속도');
    const embers = crust.addFolder('불씨');
    R(embers, c, 'crustEmber', 0, 3, 0.01, '틈새 내부');
    R(embers, c, 'crustEmberScale', 1, 30, 0.1, '미터당 불씨');
    embers.addColor(c, 'colorEmber').name('불씨 색');
    R(embers, c, 'emberRate', 0, 200, 1, '초당 상승 불씨');
    R(embers, c, 'emberSize', 0.01, 0.3, 0.005, '불씨 크기');
    R(embers, c, 'emberLife', 0.2, 5, 0.05, '불씨 수명 (s)');
    R(embers, c, 'emberRise', -2, 5, 0.05, '불씨 상승');
    const stone = crust.addFolder('석재');
    R(stone, c, 'texAmount', 0, 1, 0.01, '스캔 양');
    R(stone, c, 'texScale', 0.3, 8, 0.05, '스캔 타일 (m)');
    R(stone, c, 'normalScale', 0, 3, 0.01, '법선 강도');
    R(stone, c, 'stoneRough', 0.2, 2, 0.01, '거칠기');
    R(stone, c, 'stoneRoughFloor', 0, 1, 0.01, '거칠기 하한');
    R(stone, c, 'stoneAO', 0, 1, 0.01, '가림');
    R(stone, c, 'stoneDesat', 0, 1, 0.01, '채도 낮추기');
    R(stone, c, 'stoneGrade', 0, 1, 0.01, '등급');
    stone.addColor(c, 'colorStoneGrade').name('색보정');
    stone.addColor(c, 'colorStone').name('대체 밝은색');
    stone.addColor(c, 'colorStoneDeep').name('대체 어둠색');

    /* ---- panel 4 ---- */
    const ring = folder.addFolder('4 · 방사형 충격파 링');
    R(ring, c, 'ringReach', 0.5, 4, 0.01, '도달 (× radius)');
    R(ring, c, 'ringTime', 0.1, 4, 0.01, '소진 시간 (s)');
    R(ring, c, 'ringWidth', 0.005, 0.15, 0.001, '두께');
    R(ring, c, 'ringSpikes', 4, 80, 1, '플레어');
    R(ring, c, 'ringSpikeReach', 0, 40, 0.5, '플레어 도달');
    R(ring, c, 'ringIntensity', 0, 5, 0.05, '강도');
    R(ring, c, 'pulsePeriod', 0, 6, 0.05, '맥동 간격 (s)');
    R(ring, c, 'pulseReach', 0.5, 4, 0.01, '맥동 도달 (× radius)');
    R(ring, c, 'pulseIntensity', 0, 3, 0.05, '맥동 강도');

    /* ---- the bodies ---- */
    const bodies = folder.addFolder('유리화된 신체');
    const convert = bodies.addFolder('변환');
    R(convert, c, 'convertReach', 0.2, 2, 0.01, '도달 (× radius)');
    R(convert, c, 'convertDelay', 0, 2, 0.01, '첫 개체 (s)');
    R(convert, c, 'convertStagger', 0, 2, 0.01, '바깥 천체 지연 (s)');
    R(convert, c, 'convertTime', 0.05, 3, 0.01, '상승 시간 (s)');
    R(convert, c, 'convertCellWise', 0, 1, 0.01, '셀마다');
    R(convert, c, 'convertLead', 0.02, 1, 0.01, '이음 선행');
    R(convert, c, 'holdTime', 0, 10, 0.05, '유리 유지 (s)');
    R(convert, c, 'crackTime', 0.05, 3, 0.01, '균열 진행 (s)');
    R(convert, c, 'bodyCrackWidth', 0.002, 0.08, 0.001, '균열 너비 (m)');
    R(convert, c, 'crackGlowBody', 0, 10, 0.05, '균열 광');
    const shatter = bodies.addFolder('파쇄');
    R(shatter, c, 'shatterChunks', 4, 48, 1, '조각');
    R(shatter, c, 'shatterGap', 0, 0.05, 0.001, '조각 사이 간격 (m)');
    R(shatter, c, 'shatterSpeed', 0, 10, 0.05, '투척 속도 (m/s)');
    R(shatter, c, 'shatterLift', 0, 10, 0.05, '솟구침 (m/s)');
    R(shatter, c, 'shatterOut', 0, 3, 0.01, '원 바깥');
    R(shatter, c, 'shatterSpin', 0, 25, 0.1, '텀블링 (rad/s)');
    R(shatter, c, 'shatterGravity', -30, -2, 0.1, '중력');
    R(shatter, c, 'shatterBounce', 0, 0.9, 0.01, '튐');
    R(shatter, c, 'shatterFriction', 0, 1, 0.01, '마찰');
    R(shatter, c, 'shatterChips', 0, 500, 1, '파편 수');
    R(shatter, c, 'chipSize', 0.01, 0.3, 0.005, '파편 크기');
    R(shatter, c, 'shatterLight', 0, 200, 1, '빛 타격');
    R(shatter, c, 'shatterShake', 0, 1, 0.005, '흔들림');
    R(shatter, c, 'breakChips', 0, 400, 1, '방벽별 유리');
    const dissolve = bodies.addFolder('소멸');
    R(dissolve, c, 'dissolveDelay', 0, 10, 0.05, '조각 유지 (s)');
    R(dissolve, c, 'dissolveTime', 0.1, 6, 0.05, '용해 시간 (s)');
    R(dissolve, c, 'dissolveVapour', 0, 80, 1, '수증기/초');
    const statue = bodies.addFolder('신체의 유리');
    R(statue, c, 'bodySeamWidth', 0.002, 0.05, 0.001, '격자 너비 (m)');
    R(statue, c, 'bodySeamGlow', 0, 8, 0.05, '격자 광택');
    R(statue, c, 'bodySeamSet', 0, 1, 0.01, '격자 고정 후');
    R(statue, c, 'bodySwirl', 0, 2, 0.01, '내부 독');
    R(statue, c, 'bodySwirlScale', 0.5, 12, 0.1, '독 규모');
    R(statue, c, 'glassGlow', 0, 3, 0.01, '내부 독광');
    R(statue, c, 'glassRim', 0, 4, 0.01, '스치는 순간');
    R(statue, c, 'glassClearcoat', 0, 1, 0.01, '유리 코팅');
    R(statue, c, 'glassRough', 0, 1, 0.01, '거칠기');
    R(statue, c, 'glassEnv', 0, 4, 0.05, '반사');

    /* ---- what everything is made of ---- */
    const glass = folder.addFolder('유리');
    glass.addColor(c, 'colorDeep').name('심층');
    glass.addColor(c, 'colorGlass').name('유리');
    glass.addColor(c, 'colorGlow').name('맹독 광원');
    glass.addColor(c, 'colorLattice').name('격자');
    glass.addColor(c, 'colorVenom').name('멍');
    R(glass, c, 'envStrength', 0, 3, 0.05, '반사');
    R(glass, c, 'sunSpec', 0, 4, 0.05, '태양 하이라이트');

    const light = folder.addFolder('조명');
    R(light, c, 'lightIntensity', 0, 200, 0.5, '강도');
    R(light, c, 'lightRadius', 1, 50, 0.1, '반경');
    light.addColor(c, 'lightColor').name('색상');

    this.toxicFolder = folder;
  }

  /* ------------------------------------------------------------------ */

  _buildEnvironment() {
    const folder = this.gui.addFolder('환경');
    const e = settings.environment;
    const R = Editor.range;

    R(folder, e, 'sunIntensity', 0, 8, 0.01, '주광 강도');
    folder.addColor(e, 'sunColor').name('키라이트 색');
    R(folder, e, 'sunAzimuth', 0, Math.PI * 2, 0.01, '주광 방위각');
    R(folder, e, 'sunElevation', 0.05, 1.5, 0.01, '주광 고도');
    R(folder, e, 'ambientIntensity', 0, 3, 0.01, '주변광');
    folder.addColor(e, 'ambientColor').name('주변광 색');
    R(folder, e, 'hemiIntensity', 0, 3, 0.01, '반구');
    R(folder, e, 'envIntensity', 0, 3, 0.01, '환경 (IBL)');
    R(folder, e, 'shadowRadius', 0, 8, 0.05, '그림자 부드러움');
    R(folder, e, 'shadowBias', -0.01, 0.001, 0.0001, '그림자 편향');
    R(folder, e, 'contactShadow', 0, 1.5, 0.01, '접촉 그림자');

    const rim = folder.addFolder('림 라이트');
    R(rim, e, 'rimIntensity', 0, 4, 0.01, '림 강도');
    rim.addColor(e, 'rimColor').name('외곽 색');
    R(rim, e, 'rimAzimuth', 0, Math.PI * 2, 0.01, '가장자리 방위각');
    R(rim, e, 'rimElevation', 0.05, 1.5, 0.01, '림 높이');
    rim.addColor(e, 'hemiSkyColor').name('반구 하늘빛');
    rim.addColor(e, 'hemiGroundColor').name('반구 반사광');

    const fog = folder.addFolder('배경·안개·먼지');
    fog.addColor(e, 'backgroundColor').name('배경');
    fog.add(e, 'fogEnabled').name('안개 활성화');
    fog.addColor(e, 'fogColor').name('안개 색');
    // near = where the fog starts, far = where it is total; widening the gap or
    // pushing both out thins the fog, closing it thickens it.
    R(fog, e, 'fogNear', 1, 200, 1, '안개 시작');
    R(fog, e, 'fogFar', 10, 400, 1, '안개 끝');
    R(fog, e, 'dustAmount', 0, 3, 0.01, '떠다니는 먼지');

    const floor = folder.addFolder('무대 바닥');
    floor.add(e, 'floorTexture').name('석재 타일');
    R(floor, e, 'floorTextureScale', 0.5, 24, 0.1, '타일 크기 (m)');
    R(floor, e, 'floorNormalScale', 0, 3, 0.01, '음각 강도');
    R(floor, e, 'floorTexTint', 0, 1, 0.01, '바닥 방향 색조');
    floor.addColor(e, 'floorColor').name('바닥 색');
    floor.addColor(e, 'floorTint').name('바닥 색조');
    R(floor, e, 'floorRoughness', 0.05, 1, 0.01, '거칠기');
    R(floor, e, 'floorSheen', 0, 1, 0.01, '광택');
    R(floor, e, 'floorPool', 0, 1, 0.01, '빛 웅덩이');
  }

  _buildPost() {
    const folder = this.gui.addFolder('후처리');
    const p = settings.post;
    const R = Editor.range;

    folder.add(p, 'enabled').name('활성화');
    R(folder, p, 'exposure', 0.1, 3, 0.01, '노출');
    R(folder, p, 'bloomStrength', 0, 3, 0.01, '블룸 강도');
    R(folder, p, 'bloomRadius', 0, 1.5, 0.01, '블룸 반경');
    R(folder, p, 'bloomThreshold', 0, 2, 0.01, '블룸 한계값');
    R(folder, p, 'contrast', 0.5, 2, 0.01, '대비');
    R(folder, p, 'saturation', 0, 2.5, 0.01, '채도');
    R(folder, p, 'temperature', -0.5, 0.5, 0.01, '온도');
    R(folder, p, 'lift', -0.2, 0.2, 0.005, '상승');
    R(folder, p, 'gain', 0.5, 2, 0.01, '게인');
    R(folder, p, 'vignette', 0, 1.5, 0.01, '비네팅');
    R(folder, p, 'chromaticAberration', 0, 3, 0.01, '색수차');
    R(folder, p, 'grain', 0, 0.2, 0.001, '필름 입자');
    R(folder, p, 'distortion', 0, 0.2, 0.001, '화면 왜곡');
    R(folder, p, 'flashStrength', 0, 2, 0.01, '충돌 섬광');
  }

  _buildCamera() {
    const folder = this.gui.addFolder('카메라');
    const c = settings.camera;
    const R = Editor.range;

    // The wheel writes `distance` straight into settings, so the slider listens.
    R(folder, c, 'distance', 1, 40, 0.1, '거리').listen();
    R(folder, c, 'minDistance', 1, 20, 0.1, '최소 거리');
    R(folder, c, 'maxDistance', 4, 40, 0.1, '최대 거리');
    R(folder, c, 'zoomSpeed', 0.1, 3, 0.01, '줌 속도');
    R(folder, c, 'fov', 20, 90, 0.5, '시야각');
    R(folder, c, 'targetHeight', 0, 4, 0.01, '목표 높이');
    R(folder, c, 'minPolar', 0.05, 1.5, 0.01, '최소 높낮이');
    R(folder, c, 'maxPolar', 0.2, 1.55, 0.01, '최대 높낮이');
    R(folder, c, 'damping', 0.001, 0.5, 0.001, '추적 감쇠');
    R(folder, c, 'autoFrame', 0, 1, 0.01, '자동 프레이밍');

    // Edge panning. `dead zone` is the share of the frame that moves nothing —
    // raise it if the hand is shaky, lower it to start panning sooner.
    const panning = folder.addFolder('가장자리 패닝');
    R(panning, c, 'panDeadZone', 0, 0.95, 0.01, '데드존');
    R(panning, c, 'panSpeed', 0, 20, 0.1, '좌우 속도');
    R(panning, c, 'panRange', 0, 30, 0.5, '좌우 범위');
    R(panning, c, 'panRecenter', 0.01, 1, 0.01, '중심 유지');

    folder.add({ clear: () => this.hooks.onClear?.() }, 'clear').name('이펙트 지우기 (C)');
  }

  _buildCharacter() {
    const folder = this.gui.addFolder('캐릭터');
    const c = settings.character;
    const R = Editor.range;

    // The mixer's own rate, so it scales the idle and the cast clips together.
    // The same value as Global → animation speed, mirrored here where it is
    // actually reached for; `listen` keeps the two readouts honest.
    R(folder, settings.global, 'animationSpeed', 0.1, 3, 0.01, '재생 속도').listen();

    // Which clip each ability throws lives in that ability's own folder, under
    // "The cast"; these are the edges of the blend that lays it over the idle.
    const cast = folder.addFolder('시전');
    R(cast, c, 'castBlendIn', 0.01, 1, 0.01, '시전으로 전환');
    R(cast, c, 'castBlendOut', 0.01, 1.5, 0.01, '대기로 복귀');
    cast.add(c, 'turnToAim').name('조준 방향 회전');
    R(cast, c, 'turnRate', 0.000001, 0.02, 0.000001, '회전 추종');

    // The procedural accent that rides on top of the clip. Zero both leans to
    // let the animation carry the cast on its own.
    const lunge = folder.addFolder('돌진');
    R(lunge, c, 'castLean', 0, 1.2, 0.01, '돌진 기울기');
    R(lunge, c, 'castRecoil', 0, 0.8, 0.005, '돌진 반동');
    R(lunge, c, 'castSettle', 0.2, 8, 0.05, '돌진 안정');
  }

  /**
   * The target dummies and how they fall.
   *
   * Everything here is live: the ring re-populates while you watch, the fall's
   * gravity and stiffness apply to bodies already on the floor, and the blow's
   * numbers apply to the next thing that gets hit. The one exception is
   * `height`, which sizes the model when it is loaded.
   */
  _buildDummies() {
    const folder = this.gui.addFolder('표적 더미');
    const d = settings.dummies;
    const R = Editor.range;

    folder.add(d, 'enabled').name('활성화');
    R(folder, d, 'count', 0, 16, 1, '개수');

    const ring = folder.addFolder('서 있는 위치');
    R(ring, d, 'radius', 4, 40, 0.5, '링 반경');
    R(ring, d, 'minRadius', 1, 20, 0.5, '최소 접근 거리');
    R(ring, d, 'separation', 0.5, 6, 0.1, '간격 (m)');
    ring.add(d, 'watch').name('주시 방향 회전');
    R(ring, d, 'turnRate', 0.000001, 0.5, 0.000001, '회전 추종');

    // What a cast has to cover to knock one down, and how hard it throws it.
    const hit = folder.addFolder('타격');
    hit.add(d.hit, 'enabled').name('능력 강제 종료');
    R(hit, d.hit, 'radius', 0.2, 6, 0.05, '선 도달, 미터');
    R(hit, d.hit, 'zoneScale', 0.2, 2.5, 0.05, '원거리 범위');
    R(hit, d, 'bodyRadius', 0.1, 1.5, 0.02, '몸통 반경');
    R(hit, d.hit, 'impulse', 0, 30, 0.1, '충격량');
    R(hit, d.hit, 'lift', 0, 16, 0.1, '상승');
    R(hit, d.hit, 'spin', -3, 4, 0.05, '회전 (토크)');

    const fall = folder.addFolder('낙하');
    R(fall, d.ragdoll, 'gravity', -60, -2, 0.5, '중력');
    R(fall, d.ragdoll, 'damping', 0, 0.6, 0.005, '공기 저항');
    R(fall, d.ragdoll, 'iterations', 1, 16, 1, '솔버 횟수');
    R(fall, d.ragdoll, 'brace', 0, 1, 0.01, '몸통 강성');
    R(fall, d.ragdoll, 'radius', 0.01, 0.4, 0.005, '관절 반경');
    R(fall, d.ragdoll, 'friction', 0, 1, 0.01, '지면 마찰');
    R(fall, d.ragdoll, 'bounce', 0, 0.8, 0.01, '지면 튐');
    R(fall, d.ragdoll, 'sleep', 0.001, 0.5, 0.001, '휴면 한계');

    const corpse = folder.addFolder('시체·리스폰');
    R(corpse, d, 'corpseTime', 0, 20, 0.1, '머무름, 초');
    R(corpse, d, 'dissolveTime', 0.1, 6, 0.05, '타서 사라지는 시간');
    R(corpse, d, 'respawnDelay', 0, 15, 0.1, '재생성 지연');

    const look = folder.addFolder('외관');
    look.addColor(d.look, 'color').name('본체');
    R(look, d.look, 'roughness', 0, 1, 0.01, '거칠기');
    R(look, d.look, 'metalness', 0, 1, 0.01, '금속성');
    look.addColor(d.look, 'rimColor').name('외곽');
    R(look, d.look, 'rimPower', 0.5, 8, 0.05, '림 조임');
    R(look, d.look, 'rimEmissive', 0, 6, 0.05, '림 세기');
    look.addColor(d.look, 'edgeColor').name('연소 가장자리');
    R(look, d.look, 'edgeEmissive', 0, 20, 0.1, '타는 빛');
    R(look, d.look, 'edgeWidth', 0.01, 0.5, 0.005, '타는 너비');
    R(look, d.look, 'dissolveDetail', 1, 30, 0.5, '타는 디테일');
  }

  dispose() {
    this.gui.destroy();
  }
}
