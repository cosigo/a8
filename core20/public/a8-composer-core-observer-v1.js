(() => {
  'use strict';

  /*
   * A8 COMPOSER CORE OBSERVER
   * -------------------------
   *
   * DISPLAY ONLY.
   *
   * This module does NOT:
   *
   * - call the Composer render()
   * - read or modify bars[]
   * - alter score events
   * - touch A8MusicPlayerV1
   * - unlock playback
   * - stop playback
   * - move existing DOM controls
   * - provide timing authority
   *
   * Failure of this observer must never
   * disable the Composer.
   */

  const connect =
    document.getElementById(
      'connectCore'
    );


  if (!connect) {
    console.warn(
      'A8 CORE OBSERVER: connectCore not found'
    );

    return;
  }


  const existing =
    document.getElementById(
      'a8ComposerCoreObserver'
    );


  if (existing) {
    return;
  }


  const previewPanel =
    connect.closest(
      '.panel'
    );


  if (!previewPanel) {
    console.warn(
      'A8 CORE OBSERVER: preview panel not found'
    );

    return;
  }


  const style =
    document.createElement(
      'style'
    );


  style.textContent = `
    #a8ComposerCoreObserver {
      margin: 16px 0;
      padding: 16px;
      border: 1px solid rgba(127,127,127,.35);
      border-radius: 14px;
    }

    #a8ComposerCoreObserver
    .a8CoreObserverIntro {
      margin: 0 0 14px;
      line-height: 1.5;
      opacity: .82;
    }

    #a8ComposerCoreObserver
    .a8CoreObserverState {
      margin-bottom: 12px;
      padding: 12px;
      border: 1px solid rgba(127,127,127,.35);
      border-radius: 10px;
      font-weight: 800;
      letter-spacing: .03em;
    }

    #a8ComposerCoreObserver
    .a8CoreObserverGrid {
      display: grid;
      grid-template-columns:
        repeat(
          auto-fit,
          minmax(180px,1fr)
        );
      gap: 10px;
    }

    #a8ComposerCoreObserver
    .a8CoreObserverCell {
      padding: 12px;
      border: 1px solid rgba(127,127,127,.30);
      border-radius: 10px;
    }

    #a8ComposerCoreObserver
    .a8CoreObserverLabel {
      font-size: .75rem;
      letter-spacing: .08em;
      opacity: .62;
    }

    #a8ComposerCoreObserver
    .a8CoreObserverValue {
      margin-top: 5px;
      font-size: 1.12rem;
      font-weight: 800;
      overflow-wrap: anywhere;
    }

    #a8ComposerCoreObserver
    .a8CoreObserverDetail {
      margin-top: 5px;
      font-size: .78rem;
      opacity: .58;
    }
  `;


  document.head.appendChild(
    style
  );


  const bench =
    document.createElement(
      'section'
    );


  bench.id =
    'a8ComposerCoreObserver';


  bench.innerHTML = `
    <div class="eyebrow">
      Composer time authority · live Core evidence
    </div>

    <p class="a8CoreObserverIntro">
      This bench is disconnected by default.
      Exact A8 composition may be authored while disconnected.
      Press the existing
      <strong>CONNECT CORE20</strong>
      control to begin observing recovered Core evidence.
      Browser refresh timing below is display machinery only.
    </p>

    <div
      id="a8CoreObserverState"
      class="a8CoreObserverState"
    >
      NO CORE · OBSERVER SLEEPING
    </div>

    <div class="a8CoreObserverGrid">

      <div class="a8CoreObserverCell">

        <div class="a8CoreObserverLabel">
          A8 TIME AUTHORITY
        </div>

        <div
          id="a8CoreObserverAuthority"
          class="a8CoreObserverValue"
        >
          NO CORE
        </div>

        <div class="a8CoreObserverDetail">
          recovered Core20 civil authority
        </div>

      </div>


      <div class="a8CoreObserverCell">

        <div class="a8CoreObserverLabel">
          DAY_PHASE17
        </div>

        <div
          id="a8CoreObserverPhase"
          class="a8CoreObserverValue"
        >
          —
        </div>

        <div class="a8CoreObserverDetail">
          server-derived native civil phase
        </div>

      </div>


      <div class="a8CoreObserverCell">

        <div class="a8CoreObserverLabel">
          SELECTED RAW
        </div>

        <div
          id="a8CoreObserverRaw"
          class="a8CoreObserverValue"
        >
          —
        </div>

        <div class="a8CoreObserverDetail">
          displayed from live Core evidence
        </div>

      </div>


      <div class="a8CoreObserverCell">

        <div class="a8CoreObserverLabel">
          CORE → DAC BRIDGE
        </div>

        <div
          id="a8CoreObserverDac"
          class="a8CoreObserverValue"
        >
          WAITING FOR CORE
        </div>

        <div class="a8CoreObserverDetail">
          downstream speaker translation only
        </div>

      </div>

    </div>
  `;


  /*
   * Critical safety choice:
   *
   * Add a NEW sibling panel after the existing
   * preview panel.
   *
   * Never replace, empty, prepend into, or
   * re-parent the existing Composer controls.
   */
  previewPanel.insertAdjacentElement(
    'afterend',
    bench
  );


  const $ =
    id =>
      document.getElementById(
        id
      );


  function set(
    id,
    value
  ) {
    const node =
      $(id);

    if (node) {
      node.textContent =
        String(value);
    }
  }


  function normalized(
    key
  ) {
    return String(key)
      .toLowerCase()
      .replace(
        /[^a-z0-9]/g,
        ''
      );
  }


  function findScalar(
    object,
    candidates
  ) {
    if (
      !object ||
      typeof object !==
        'object'
    ) {
      return undefined;
    }


    for (
      const [
        key,
        value
      ]
      of Object.entries(
        object
      )
    ) {
      if (
        candidates.includes(
          normalized(key)
        ) &&
        (
          typeof value ===
            'number' ||
          typeof value ===
            'string'
        )
      ) {
        return value;
      }
    }


    for (
      const value
      of Object.values(
        object
      )
    ) {
      if (
        value &&
        typeof value ===
          'object'
      ) {
        const found =
          findScalar(
            value,
            candidates
          );

        if (
          found !==
          undefined
        ) {
          return found;
        }
      }
    }


    return undefined;
  }


  let polling =
    false;


  let timer =
    null;


  let lastRaw =
    undefined;


  let lastPhase =
    undefined;


  async function observe() {
    try {
      const response =
        await fetch(
          '/api/core20/clock',
          {
            cache:
              'no-store'
          }
        );


      if (!response.ok) {
        throw new Error(
          'CLOCK ENDPOINT UNAVAILABLE'
        );
      }


      const core =
        await response.json();


      /*
       * Exact Core20 public clock contract.
       *
       * No field-name guessing:
       *
       *   clock.dayPhase17
       *   clock.currentSelectedRawPulse
       *   clock.clockAuthority
       */
      const clock =
        core.clock || {};


      const phase =
        clock.dayPhase17;


      const raw =
        clock.currentSelectedRawPulse;


      const authority =
        clock.clockAuthority;


      if (
        phase !==
        undefined
      ) {
        const moving =
          lastPhase !==
            undefined &&
          String(phase) !==
            String(lastPhase);


        set(
          'a8CoreObserverPhase',
          String(phase) +
          (
            moving
              ? '  ↑'
              : ''
          )
        );


        lastPhase =
          phase;
      } else {
        set(
          'a8CoreObserverPhase',
          'FIELD UNRESOLVED'
        );
      }


      if (
        raw !==
        undefined
      ) {
        const moving =
          lastRaw !==
            undefined &&
          String(raw) !==
            String(lastRaw);


        set(
          'a8CoreObserverRaw',
          String(raw) +
          (
            moving
              ? '  ↑'
              : ''
          )
        );


        lastRaw =
          raw;
      } else {
        set(
          'a8CoreObserverRaw',
          'FIELD UNRESOLVED'
        );
      }


      const authorityDisplay =
        authority ===
        'RECOVERED_JOVIAN_MINTAKA_SOL_SUN_RETURN'
          ? 'JOVIAN RESONANT MOONS · MINTAKA · SOL · SUN RETURN'
          : (
              authority ||
              'RECOVERED A8 CORE'
            );


      set(
        'a8CoreObserverAuthority',
        authorityDisplay
      );


      set(
        'a8CoreObserverDac',
        '675 / 1024 · OUTPUT ONLY'
      );


      set(
        'a8CoreObserverState',
        'CORE EVIDENCE LIVE'
      );

    } catch (error) {
      set(
        'a8CoreObserverState',
        'CORE OBSERVER LINK LOST'
      );


      set(
        'a8CoreObserverAuthority',
        'NO LIVE EVIDENCE'
      );


      /*
       * Intentionally do NOTHING to
       * Composer/player state here.
       */
      console.warn(
        'A8 CORE OBSERVER:',
        error
      );
    }
  }


  function startObserver() {
    if (polling) {
      return;
    }


    polling =
      true;


    set(
      'a8CoreObserverState',
      'SEEKING RECOVERED A8 CORE…'
    );


    /*
     * This timer updates DISPLAY ONLY.
     *
     * It is not an A8 clock, score clock,
     * playback clock, duration source,
     * transport source, or run authority.
     */
    observe();


    timer =
      window.setInterval(
        observe,
        750
      );
  }


  /*
   * The existing Composer owns CONNECT CORE20.
   *
   * We merely observe the same explicit user
   * action after the Composer's own handler.
   */
  connect.addEventListener(
    'click',
    () => {
      window.setTimeout(
        startObserver,
        0
      );
    }
  );


  window.addEventListener(
    'pagehide',
    () => {
      if (timer) {
        window.clearInterval(
          timer
        );
      }
    },
    {
      once:
        true
    }
  );

})();
