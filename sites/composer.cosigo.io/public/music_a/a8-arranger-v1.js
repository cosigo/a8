(() => {
  'use strict';

  const api =
    window.A8ComposerLabV1;

  if (!api) {
    console.error(
      'A8 ARRANGER V1B · LAB API NOT FOUND'
    );

    return;
  }


  const noteNames =
    api.noteNames();


  const root =
    document.createElement(
      'div'
    );

  root.className =
    'a8-arranger-v1';

  root.hidden =
    true;

  root.innerHTML = `
    <div
      class="a8-arranger-backdrop"
      data-a8-action="close"
    ></div>

    <section
      class="a8-arranger-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="A8 note controls"
    >
      <div class="a8-arranger-head">

        <button
          type="button"
          class="a8-arranger-button"
          data-a8-action="back"
          hidden
          aria-label="Back"
        >←</button>

        <div class="a8-arranger-title">
          <strong data-a8-title>
            NOTE
          </strong>

          <small data-a8-subtitle></small>
        </div>

        <button
          type="button"
          class="a8-arranger-button a8-arranger-close"
          data-a8-action="close"
          aria-label="Close"
        >×</button>

      </div>


      <!-- =========================================
           EXISTING NOTE
           ========================================= -->

      <div
        class="a8-arranger-view"
        data-a8-view="main"
      >

        <div class="a8-arranger-menu">

          <button
            type="button"
            class="a8-arranger-button"
            data-a8-action="view-timing"
          >
            TIMING ›
          </button>

          <button
            type="button"
            class="a8-arranger-button"
            data-a8-action="view-voice"
          >
            VOICE ›
          </button>

        </div>


        <div class="a8-arranger-section">

          <h3>
            PITCH · CYCLES / A8 SECOND
          </h3>

          <div class="a8-arranger-adjust">

            <button
              type="button"
              class="a8-arranger-button"
              data-a8-action="pitch-down"
              aria-label="Lower pitch"
            >−</button>

            <strong
              class="a8-arranger-value"
              data-a8-pitch
            ></strong>

            <button
              type="button"
              class="a8-arranger-button"
              data-a8-action="pitch-up"
              aria-label="Raise pitch"
            >+</button>

          </div>

        </div>


        <button
          type="button"
          class="a8-arranger-button a8-arranger-danger"
          data-a8-action="audition"
        >
          ▶ AUDITION
        </button>

        <button
          type="button"
          class="a8-arranger-button a8-arranger-danger"
          data-a8-action="audition-all"
        >
          ▶ AUDITION ALL
        </button>

        <button
          type="button"
          class="a8-arranger-button a8-arranger-danger"
          data-a8-action="delete"
        >
          DELETE NOTE
        </button>

      </div>


      <!-- =========================================
           TIMING
           ========================================= -->

      <div
        class="a8-arranger-view"
        data-a8-view="timing"
        hidden
      >

        <div class="a8-arranger-section">

          <h3>
            TIMING · NATIVE A8 DURATION
          </h3>

          <div class="a8-arranger-adjust">

            <button
              type="button"
              class="a8-arranger-button"
              data-a8-action="duration-down"
              aria-label="Subtract one sixteenth A8 second"
            >−</button>

            <strong
              class="a8-arranger-value"
            >1/16</strong>

            <button
              type="button"
              class="a8-arranger-button"
              data-a8-action="duration-up"
              aria-label="Add one sixteenth A8 second"
            >+</button>

          </div>

          <div
            class="a8-arranger-grid a8-arranger-timing"
          >
            <button type="button" class="a8-arranger-choice" data-a8-duration="1/16">1/16</button>
            <button type="button" class="a8-arranger-choice" data-a8-duration="1/8">1/8</button>
            <button type="button" class="a8-arranger-choice" data-a8-duration="1/4">1/4</button>
            <button type="button" class="a8-arranger-choice" data-a8-duration="1/2">1/2</button>
            <button type="button" class="a8-arranger-choice" data-a8-duration="3/4">3/4</button>
            <button type="button" class="a8-arranger-choice" data-a8-duration="1">1</button>
            <button type="button" class="a8-arranger-choice" data-a8-duration="2">2</button>
            <button type="button" class="a8-arranger-choice" data-a8-duration="4">4</button>
          </div>

        </div>

      </div>


      <!-- =========================================
           VOICE
           ========================================= -->

      <div
        class="a8-arranger-view"
        data-a8-view="voice"
        hidden
      >

        <div class="a8-arranger-section">

          <h3>
            WAVE · SINGLE
          </h3>

          <div class="a8-arranger-grid">

            <button type="button" class="a8-arranger-choice" data-a8-wave="sine">
              SINE
            </button>

            <button type="button" class="a8-arranger-choice" data-a8-wave="triangle">
              TRIANGLE
            </button>

            <button type="button" class="a8-arranger-choice" data-a8-wave="square">
              SQUARE
            </button>

            <button type="button" class="a8-arranger-choice" data-a8-wave="sawtooth">
              SAW
            </button>

          </div>

        </div>


        <div class="a8-arranger-section">

          <h3>
            WAVE · MIX
          </h3>

          <div class="a8-arranger-grid">

            <button type="button" class="a8-arranger-choice" data-a8-wave="sine+triangle">
              SINE + TRI
            </button>

            <button type="button" class="a8-arranger-choice" data-a8-wave="sine+square">
              SINE + SQUARE
            </button>

            <button type="button" class="a8-arranger-choice" data-a8-wave="sine+sawtooth">
              SINE + SAW
            </button>

            <button type="button" class="a8-arranger-choice" data-a8-wave="triangle+square">
              TRI + SQUARE
            </button>

            <button type="button" class="a8-arranger-choice" data-a8-wave="triangle+sawtooth">
              TRI + SAW
            </button>

            <button type="button" class="a8-arranger-choice" data-a8-wave="square+sawtooth">
              SQUARE + SAW
            </button>

            <button type="button" class="a8-arranger-choice" data-a8-wave="sine+triangle+square+sawtooth">
              ALL 4
            </button>

          </div>

        </div>


        <div class="a8-arranger-section">

          <h3>
            MOTION · ENTIRE NOTE
          </h3>

          <div class="a8-arranger-grid">

            <button type="button" class="a8-arranger-choice" data-a8-motion="steady">
              STEADY
            </button>

            <button type="button" class="a8-arranger-choice" data-a8-motion="rise">
              RISE
            </button>

            <button type="button" class="a8-arranger-choice" data-a8-motion="fall">
              FALL
            </button>

            <button type="button" class="a8-arranger-choice" data-a8-motion="whoosh">
              WHOOSH
            </button>

          </div>

        </div>


        <div class="a8-arranger-section">

          <h3>
            AMPLITUDE
          </h3>

          <div class="a8-arranger-adjust">

            <button
              type="button"
              class="a8-arranger-button"
              data-a8-action="gain-down"
              aria-label="Lower amplitude"
            >−</button>

            <strong
              class="a8-arranger-value"
              data-a8-gain
            ></strong>

            <button
              type="button"
              class="a8-arranger-button"
              data-a8-action="gain-up"
              aria-label="Raise amplitude"
            >+</button>

          </div>

        </div>

      </div>


      <!-- =========================================
           NEW NOTE
           ========================================= -->

      <div
        class="a8-arranger-view"
        data-a8-view="insert"
        hidden
      >

        <div class="a8-arranger-section">

          <h3>
            OCTAVE
          </h3>

          <div
            class="a8-arranger-grid a8-arranger-octaves"
          >
            <button type="button" class="a8-arranger-choice" data-a8-octave="-2">−2</button>
            <button type="button" class="a8-arranger-choice" data-a8-octave="-1">−1</button>
            <button type="button" class="a8-arranger-choice" data-a8-octave="0">0</button>
            <button type="button" class="a8-arranger-choice" data-a8-octave="1">+1</button>
            <button type="button" class="a8-arranger-choice" data-a8-octave="2">+2</button>
          </div>

        </div>


        <div
          class="a8-arranger-section"
          data-a8-note-step
          hidden
        >

          <h3>
            NOTE
          </h3>

          <div
            class="a8-arranger-grid a8-arranger-notes"
            data-a8-note-grid
          ></div>

        </div>

      </div>


      <div
        class="a8-arranger-status"
        data-a8-status
        aria-live="polite"
      ></div>

    </section>
  `;

  document.body.appendChild(
    root
  );

  /* V9: Share one editor surface, retaining the original Composer
     inspector's native exact-pitch and explicit-rest bindings.  The
     Arranger's controls and insertion machinery remain authoritative.
     Do not create a second popup or mirror controls with new APIs. */
  const v9Inspector = document.getElementById('inspector');
  const v9Sheet = root.querySelector('.a8-arranger-sheet');
  if (v9Inspector && v9Sheet) {
    v9Inspector.classList.add('a8-v9-embedded-inspector');
    v9Sheet.appendChild(v9Inspector);
    root.dataset.v9Layer = 'A';
    window.addEventListener('a8-arranger-note-selected', () => {
      root.dataset.v9Layer = 'A';
    });
    window.addEventListener('a8-arranger-layer-selected', event => {
      const layer = event.detail?.layer;
      if (layer === 'B' || layer === 'C') root.dataset.v9Layer = layer;
    });
  }


  const $ =
    selector =>
      root.querySelector(
        selector
      );

  const $$ =
    selector =>
      [
        ...root.querySelectorAll(
          selector
        )
      ];


  const back =
    $('[data-a8-action="back"]');

  const title =
    $('[data-a8-title]');

  const subtitle =
    $('[data-a8-subtitle]');

  const status =
    $('[data-a8-status]');

  const noteStep =
    $('[data-a8-note-step]');

  const noteGrid =
    $('[data-a8-note-grid]');


  /*
   * REST belongs beside note creation,
   * but unlike a pitched note it needs no octave.
   *
   * Keep it visible before the hidden note-choice step.
   */
  const restRow =
    document.createElement(
      'div'
    );


  restRow.className =
    'a8-arranger-grid a8-arranger-rest';


  const restButton =
    document.createElement(
      'button'
    );


  restButton.type =
    'button';


  restButton.className =
    'a8-arranger-choice';


  restButton.dataset
    .a8InsertRest =
      '1';


  restButton.textContent =
    'REST';


  restRow.appendChild(
    restButton
  );


  if (
    noteStep &&
    noteStep.parentElement
  ) {

    noteStep.parentElement
      .insertBefore(
        restRow,
        noteStep
      );
  }


  let note =
    null;

  let currentView =
    'main';

  let insertTarget =
    null;

  let insertOctave =
    null;


  /*
   * REST timing is native slots.
   *
   * 4  slots = 1/4 A8s
   * 8  slots = 1/2 A8s
   * 16 slots = 1 A8s
   */
  let a8RestSlots =
    4;


  let a8RestMode =
    null;


  /*
   * Build note choices from the Composer's
   * existing NOTE_REFERENCE authority.
   */
  for (
    const name
    of noteNames
  ) {
    const button =
      document.createElement(
        'button'
      );

    button.type =
      'button';

    button.className =
      'a8-arranger-choice';

    button.dataset
      .a8InsertNote =
        name;

    button.textContent =
      name;

    noteGrid.appendChild(
      button
    );
  }


  function message(
    text,
    error = false
  ) {
    status.textContent =
      text || '';

    status.classList
      .toggle(
        'is-error',
        error
      );
  }


  function showView(
    name
  ) {
    currentView =
      name;

    for (
      const view
      of $$(
        '[data-a8-view]'
      )
    ) {
      view.hidden =
        view.dataset.a8View !==
        name;
    }

    back.hidden =
      (
        name ===
        'main' ||
        name ===
        'insert'
      );

    message('');
  }


  function noteTitle(
    data
  ) {
    const name =
      data.noteName ||
      data.label ||
      'NOTE';

    if (
      Number.isInteger(
        data.octaveShift
      )
    ) {
      return (
        name +
        ' · ' +
        (
          data.octaveShift >
          0
            ? '+'
            : ''
        ) +
        data.octaveShift
      );
    }

    return name;
  }


  function sync(
    data
  ) {
    if (!data) {
      close();
      return;
    }

    note =
      data;

    title.textContent =
      noteTitle(
        data
      );

    subtitle.textContent =
      'DURATION ' +
      data.durationA8;

    $('[data-a8-pitch]')
      .textContent =
        String(
          data.cyclesPerA8Second
        );

    $('[data-a8-gain]')
      .textContent =
        Number(
          data.gain
        ).toFixed(
          2
        );


    for (
      const button
      of $$(
        '[data-a8-duration]'
      )
    ) {
      button.classList
        .toggle(
          'is-selected',
          button.dataset
            .a8Duration ===
          String(
            data.durationA8
          )
        );
    }


    for (
      const button
      of $$(
        '[data-a8-wave]'
      )
    ) {
      button.classList
        .toggle(
          'is-selected',
          button.dataset
            .a8Wave ===
          String(
            data.waveform
          )
        );
    }


    for (
      const button
      of $$(
        '[data-a8-motion]'
      )
    ) {
      button.classList
        .toggle(
          'is-selected',
          button.dataset
            .a8Motion ===
          String(
            data.motion
          )
        );
    }
  }


  /*
   * ==========================================================
   * ADD NEXT
   * ==========================================================
   */

  function a8SetInsertRestVisible(
    visible
  ) {

    const row =
      root.querySelector(
        '.a8-arranger-rest'
      );


    if (row) {
      row.hidden =
        !visible;
    }
  }


  /*
   * ==========================================================
   * SIMPLE EVENT UI
   * ==========================================================
   *
   * NOTE = timed sound
   * REST = timed silence
   *
   * Both use exactly the same +/- native duration
   * controls.
   */
  function a8InstallAddNextUI() {

    const main =
      root.querySelector(
        '[data-a8-view="main"]'
      );


    if (!main) {
      throw new Error(
        'ARRANGER MAIN VIEW NOT FOUND'
      );
    }


    const deleteButton =
      [
        ...main.querySelectorAll(
          'button'
        )
      ].find(
        button =>
          /^DELETE (NOTE|REST)$/.test(
            button.textContent
              .trim()
          )
      );


    if (!deleteButton) {
      throw new Error(
        'DELETE EVENT CONTROL NOT FOUND'
      );
    }


    /*
     * Always-visible native timing adjustment.
     */
    if (
      !main.querySelector(
        '[data-a8-inline-timing]'
      )
    ) {

      const timing =
        document.createElement(
          'div'
        );


      timing.className =
        'a8-arranger-section';


      timing.dataset
        .a8InlineTiming =
          '1';


      timing.innerHTML = `
        <h3>
          TIMING
        </h3>

        <div class="a8-arranger-grid">

          <button
            type="button"
            class="a8-arranger-choice"
            data-a8-action="duration-down"
          >
            − 1/16
          </button>

          <strong
            data-a8-inline-duration
            style="
              display:flex;
              align-items:center;
              justify-content:center;
              min-height:44px;
            "
          >
            —
          </strong>

          <button
            type="button"
            class="a8-arranger-choice"
            data-a8-action="duration-up"
          >
            + 1/16
          </button>

        </div>
      `;


      deleteButton.before(
        timing
      );
    }


    /*
     * ADD NEXT belongs to NOTE selection.
     *
     * User chooses the NOTE after which the
     * next NOTE or REST should be inserted.
     */
    if (
      !main.querySelector(
        '[data-a8-add-next-section]'
      )
    ) {

      const next =
        document.createElement(
          'div'
        );


      next.className =
        'a8-arranger-section';


      next.dataset
        .a8AddNextSection =
          '1';


      next.innerHTML = `
        <h3>
          ADD NEXT
        </h3>

        <div class="a8-arranger-grid">

          <button
            type="button"
            class="a8-arranger-choice"
            data-a8-add-next-note
          >
            NOTE
          </button>

          <button
            type="button"
            class="a8-arranger-choice"
            data-a8-add-next-rest
          >
            REST
          </button>

        </div>
      `;


      deleteButton.before(
        next
      );
    }
  }


  function a8SyncSimpleEventUI(
    data
  ) {

    if (!data) {
      return;
    }


    const isRest =
      data.type ===
        'rest';


    const duration =
      root.querySelector(
        '[data-a8-inline-duration]'
      );


    if (duration) {
      duration.textContent =
        String(
          data.durationA8 ||
          '—'
        ) +
        ' A8s';
    }


    const main =
      root.querySelector(
        '[data-a8-view="main"]'
      );


    if (!main) {
      return;
    }


    const deleteButton =
      [
        ...main.querySelectorAll(
          'button'
        )
      ].find(
        button =>
          /^DELETE (NOTE|REST)$/.test(
            button.textContent
              .trim()
          )
      );


    if (deleteButton) {
      deleteButton.textContent =
        isRest
          ? 'DELETE REST'
          : 'DELETE NOTE';
    }


    const next =
      main.querySelector(
        '[data-a8-add-next-section]'
      );


    if (next) {

      /*
       * NOTE selection:
       *   ADD NEXT · NOTE / REST
       *
       * REST selection:
       *   ADD NEXT · NOTE
       */
      next.hidden =
        false;


      const restButton =
        next.querySelector(
          '[data-a8-add-next-rest]'
        );


      if (restButton) {
        restButton.hidden =
          isRest;
      }
    }


    /*
     * Selected REST has no sound to audition.
     */
    const audition =
      main.querySelector(
        '[data-a8-action="audition"]'
      );


    if (audition) {
      audition.hidden =
        isRest;
    }


    if (isRest) {

      title.textContent =
        'REST';


      subtitle.textContent =
        String(
          data.durationA8
        ) +
        ' A8s';
    }
  }


  function a8OpenNoteAfterSelected() {

    note =
      null;


    insertTarget = {
      afterSelected:
        true
    };


    insertOctave =
      null;


    root.hidden =
      false;


    title.textContent =
      'ADD NEXT NOTE';


    subtitle.textContent =
      'AFTER SELECTED NOTE';


    noteStep.hidden =
      true;


    a8SetInsertRestVisible(
      false
    );


    $$(
      '[data-a8-octave]'
    ).forEach(
      button =>
        button.classList
          .remove(
            'is-selected'
          )
    );


    showView(
      'insert'
    );
  }


  a8InstallAddNextUI();


  function openNote(
    data
  ) {
    if (!data) {
      return;
    }

    insertTarget =
      null;

    insertOctave =
      null;

    root.hidden =
      false;

    showView(
      'main'
    );

    sync(
      data
    );


    a8SyncSimpleEventUI(
      data
    );
  }


  function openInsert(
    target
  ) {
    note =
      null;

    insertTarget =
      target;

    insertOctave =
      null;

    root.hidden =
      false;

    title.textContent =
      'ADD NOTE';

    subtitle.textContent =
      target.barLabel ||
      'OPEN BAR';

    noteStep.hidden =
      true;


    a8SetInsertRestVisible(
      true
    );


    for (
      const button
      of $$(
        '[data-a8-octave]'
      )
    ) {
      button.classList
        .remove(
          'is-selected'
        );
    }


    showView(
      'insert'
    );
  }


  function close() {
    root.hidden =
      true;

    note =
      null;

    insertTarget =
      null;

    insertOctave =
      null;

    message('');
  }


  function run(
    fn,
    success
  ) {
    try {
      const result =
        fn();

      if (
        result &&
        currentView !==
        'insert'
      ) {
        sync(
          result
        );


        a8SyncSimpleEventUI(
          result
        );
      }

      if (success) {
        message(
          success
        );
      }

      return result;

    } catch (
      error
    ) {
      message(
        error?.message ||
        String(
          error
        ),
        true
      );

      return null;
    }
  }


  /*
   * Pixel position chooses only insertion order.
   * Actual A8 time remains event-order/native-slot
   * arithmetic inside Composer.
   */
  function insertionIndex(
    lane,
    clientX
  ) {
    const chips =
      [
        ...lane.querySelectorAll(
          '.score-chip'
        )
      ];

    for (
      let i = 0;
      i < chips.length;
      i++
    ) {
      const rect =
        chips[i]
          .getBoundingClientRect();

      if (
        clientX <
        rect.left +
        rect.width / 2
      ) {
        return i;
      }
    }

    return chips.length;
  }


  root.addEventListener(
    'click',
    event => {

      const target =
        event.target.closest(
          'button,[data-a8-action]'
        );

      if (!target) {
        return;
      }


      const action =
        target.dataset
          .a8Action;


      if (
        action ===
        'close'
      ) {
        close();
        return;
      }


      if (
        action ===
        'back'
      ) {
        showView(
          'main'
        );

        return;
      }


      if (
        action ===
        'view-timing'
      ) {
        showView(
          'timing'
        );

        return;
      }


      if (
        action ===
        'view-voice'
      ) {
        showView(
          'voice'
        );

        return;
      }


      if (
        action ===
        'pitch-down'
      ) {
        run(
          () =>
            api.adjustPitch(
              -4
            ),
          'PITCH −4'
        );

        return;
      }


      if (
        action ===
        'pitch-up'
      ) {
        run(
          () =>
            api.adjustPitch(
              4
            ),
          'PITCH +4'
        );

        return;
      }


      if (
        action ===
        'gain-down'
      ) {
        run(
          () =>
            api.adjustGain(
              -0.05
            ),
          'AMPLITUDE −'
        );

        return;
      }


      if (
        action ===
        'gain-up'
      ) {
        run(
          () =>
            api.adjustGain(
              0.05
            ),
          'AMPLITUDE +'
        );

        return;
      }


      if (
        action ===
        'delete'
      ) {
        if (
          window.confirm(
            'DELETE THIS NOTE?'
          )
        ) {
          run(
            () =>
              api.deleteNote()
          );

          close();
        }

        return;
      }


      const octave =
        target.dataset
          .a8Octave;

      if (
        octave !==
        undefined
      ) {
        insertOctave =
          Number(
            octave
          );


        for (
          const button
          of $$(
            '[data-a8-octave]'
          )
        ) {
          button.classList
            .toggle(
              'is-selected',
              button ===
              target
            );
        }


        noteStep.hidden =
          false;

        message(
          'OCTAVE ' +
          (
            insertOctave >
            0
              ? '+' +
                insertOctave
              : String(
                  insertOctave
                )
          ) +
          ' · CHOOSE NOTE'
        );

        return;
      }


      const insertRest =
        target.dataset
          .a8InsertRest;


      if (
        insertRest
      ) {

        if (
          !insertTarget
        ) {
          message(
            'NO INSERT TARGET',
            true
          );

          return;
        }


        const result =
          run(
            () =>
              api.insertRest(
                insertTarget.barId,
                insertTarget.index
              ),
            'REST INSERTED'
          );


        if (
          result
        ) {
          close();
        }


        return;
      }


      const insertName =
        target.dataset
          .a8InsertNote;

      if (insertName) {

        if (
          !insertTarget ||
          !Number.isInteger(
            insertOctave
          )
        ) {
          message(
            'CHOOSE OCTAVE FIRST',
            true
          );

          return;
        }


        const result =
          run(
            () =>
              (
                insertTarget.appendLane ===
                  'A'
                  ? api.a8UniversalAppendNote(
                      insertName,
                      insertOctave
                    )
                  : (
                      insertTarget.afterSelected
                        ? api.insertNoteAfterSelected(
                            insertName,
                            insertOctave
                          )
                        : api.insertNote(
                            insertTarget.barId,
                            insertTarget.index,
                            insertName,
                            insertOctave
                          )
                    )
              )
          );


        if (result) {

          /*
           * Newly-created NOTE is already selected.
           *
           * Stay inside the arranger and switch
           * directly from NOTE CHOICE to NOTE SHAPING.
           */
          openNote(
            result
          );
        }

        return;
      }


      if (
        action ===
        'duration-down'
      ) {
        run(
          () =>
            api.adjustDuration(
              -1
            ),
          'TIMING − 1/16'
        );

        return;
      }


      if (
        action ===
        'duration-up'
      ) {
        run(
          () =>
            api.adjustDuration(
              1
            ),
          'TIMING + 1/16'
        );

        return;
      }


      const duration =
        target.dataset
          .a8Duration;

      if (duration) {
        run(
          () =>
            api.setDuration(
              duration
            ),
          'TIMING · ' +
          duration
        );

        return;
      }


      const waveform =
        target.dataset
          .a8Wave;

      if (waveform) {
        run(
          () =>
            api.setWaveform(
              waveform
            ),
          'VOICE · ' +
          target.textContent
            .trim()
        );

        return;
      }


      const motion =
        target.dataset
          .a8Motion;

      if (motion) {
        run(
          () =>
            api.setMotion(
              motion
            ),
          'MOTION · ' +
          motion.toUpperCase()
        );
      }
    }
  );


  /*
   * Existing note tap.
   */
  window.addEventListener(
    'a8-arranger-note-selected',
    event => {

      if (
        event.detail
      ) {
        openNote(
          event.detail
        );
      }
    }
  );


  window.addEventListener(
    'a8-arranger-note-updated',
    event => {

      if (
        !root.hidden &&
        event.detail
      ) {
        sync(
          event.detail
        );


        a8SyncSimpleEventUI(
          event.detail
        );
      }
    }
  );


  /*
   * Blank bar tap -> insertion sheet.
   */
  const barsHost =
    document.getElementById(
      'bars'
    );

  if (barsHost) {

    barsHost.addEventListener(
      'click',
      event => {

        /*
         * Existing note/rest clicks belong to
         * Composer's existing selection path.
         */
        if (
          event.target.closest(
            '.score-chip'
          )
        ) {
          return;
        }


        const lane =
          event.target.closest(
            '[data-bar-lane]'
          );

        if (!lane) {
          return;
        }


        const barId =
          Number(
            lane.dataset
              .barLane
          );


        if (
          !Number.isFinite(
            barId
          )
        ) {
          return;
        }


        const card =
          lane.closest(
            '.bar-card'
          );


        const label =
          card
            ?.querySelector(
              '.bar-open strong'
            )
            ?.textContent
            ?.trim() ||
          'OPEN BAR';


        openInsert({
          barId,

          index:
            insertionIndex(
              lane,
              event.clientX
            ),

          barLabel:
            label
        });
      }
    );
  }


  document.addEventListener(
    'keydown',
    event => {

      if (
        event.key ===
        'Escape' &&
        !root.hidden
      ) {
        close();
      }
    }
  );


  document.documentElement
    .classList
    .add(
      'a8-arranger-v1b'
    );


  console.info(
    'A8 ARRANGER V1B · READY'
  );

  /*
   * NOTE AUDITION
   * -------------
   *
   * Arranger owns only the user gesture.
   * Composer/player own the actual playback.
   */
  root.addEventListener(
    'click',
    event => {

      const button =
        event.target.closest(
          '[data-a8-action="audition"]'
        );


      if (!button) {
        return;
      }


      event.preventDefault();


      window.dispatchEvent(
        new CustomEvent(
          'a8-arranger-audition-selected'
        )
      );
    }
  );


  /*
   * AUDITION ALL
   *
   * Arranger owns only the button.
   * Composer / player own playback.
   */
  root.addEventListener(
    'click',
    event => {

      const button =
        event.target.closest(
          '[data-a8-action="audition-all"]'
        );


      if (!button) {
        return;
      }


      event.preventDefault();


      window.dispatchEvent(
        new CustomEvent(
          'a8-arranger-audition-all'
        )
      );
    }
  );





  /*
   * ADD NEXT
   *
   * NOTE -> existing note chooser.
   * REST -> immediate inherited-duration silence.
   */
  root.addEventListener(
    'click',
    event => {

      const addNote =
        event.target.closest(
          '[data-a8-add-next-note]'
        );


      const addRest =
        event.target.closest(
          '[data-a8-add-next-rest]'
        );


      if (
        !addNote &&
        !addRest
      ) {
        return;
      }


      event.preventDefault();
      event.stopImmediatePropagation();


      if (addNote) {

        a8OpenNoteAfterSelected();

        return;
      }


      if (addRest) {

        run(
          () =>
            api
              .insertRestAfterSelected(),
          'REST ADDED NEXT'
        );
      }
    },
    true
  );


  /* A8-ARRANGER-PLASTIC-ABC-V2-BEGIN */

  /*
   * Same popup.
   * Different selected material.
   *
   * A = existing note/rest behavior
   * B = beat hit
   * C = logical chord
   */

  let a8PlasticPopupLayer =
    null;


  function a8PlasticMainView() {

    return (
      root.querySelector(
        '[data-a8-view="main"]'
      )
    );
  }


  function a8PlasticRestoreSections() {

    root
      .querySelectorAll(
        '[data-a8-plastic-hidden="1"]'
      )
      .forEach(
        section => {

          section.hidden =
            false;


          delete section.dataset
            .a8PlasticHidden;
        }
      );
  }


  function a8PlasticHideHeading(
    prefix
  ) {

    const main =
      a8PlasticMainView();


    if (!main) {
      return;
    }


    Array.from(
      main.querySelectorAll(
        '.a8-arranger-section'
      )
    )
      .forEach(
        section => {

          const heading =
            section.querySelector(
              'h3'
            );


          if (
            !heading
          ) {
            return;
          }


          const text =
            heading.textContent
              .trim()
              .toUpperCase();


          if (
            text.startsWith(
              prefix
            )
          ) {

            section.hidden =
              true;


            section.dataset
              .a8PlasticHidden =
                '1';
          }
        }
      );
  }


  function a8PlasticDeleteButton() {

    return (
      root.querySelector(
        '[data-a8-action="delete"]'
      )
    );
  }


  function a8PlasticSyncPopup(
    data
  ) {

    if (!data) {
      return;
    }


    a8PlasticRestoreSections();


    a8PlasticPopupLayer =
      data.layer ||
      null;


    const main =
      a8PlasticMainView();


    if (!main) {
      return;
    }


    const next =
      main.querySelector(
        '[data-a8-add-next-section]'
      );


    const nextButton =
      next &&
      next.querySelector(
        '[data-a8-add-next-note], [data-a8-plastic-next]'
      );


    const restButton =
      next &&
      next.querySelector(
        '[data-a8-add-next-rest]'
      );


    const deleteButton =
      a8PlasticDeleteButton();


    const audition =
      main.querySelector(
        '[data-a8-action="audition"]'
      );


    const auditionAll =
      main.querySelector(
        '[data-a8-action="audition-all"]'
      );


    /*
     * --------------------------
     * NORMAL A
     * --------------------------
     */

    if (
      ![
        'B',
        'C'
      ].includes(
        a8PlasticPopupLayer
      )
    ) {

      if (nextButton) {
        nextButton.textContent =
          'NOTE';


        delete nextButton.dataset
          .a8PlasticNext;


        nextButton.dataset
          .a8AddNextNote =
            '';
      }


      if (restButton) {
        restButton.hidden =
          data.type ===
            'rest';
      }


      if (deleteButton) {
        deleteButton.textContent =
          data.type ===
            'rest'
            ? 'DELETE REST'
            : 'DELETE NOTE';
      }


      if (audition) {
        audition.hidden =
          data.type ===
            'rest';
      }


      if (auditionAll) {
        auditionAll.hidden =
          false;
      }


      return;
    }


    /*
     * --------------------------
     * B · BEAT
     * --------------------------
     */

    if (
      a8PlasticPopupLayer ===
        'B'
    ) {

      title.textContent =
        'BEAT · ' +
        String(
          data.label ||
          'HIT'
        );


      subtitle.textContent =
        String(
          data.durationA8
        ) +
        ' A8s · MIX ' +
        Math.round(
          Number(
            data.mixGain ??
            0.35
          ) *
          100
        ) +
        '%';


      if (next) {
        next.hidden =
          false;
      }


      if (nextButton) {
        nextButton.textContent =
          'BEAT';


        delete nextButton.dataset
          .a8AddNextNote;


        nextButton.dataset
          .a8PlasticNext =
            'B';
      }


      if (restButton) {
        restButton.hidden =
          true;
      }


      if (deleteButton) {
        deleteButton.textContent =
          'DELETE BEAT';
      }


      if (audition) {
        audition.hidden =
          true;
      }


      if (auditionAll) {
        auditionAll.hidden =
          true;
      }


      return;
    }


    /*
     * --------------------------
     * C · CHORD
     * --------------------------
     */

    title.textContent =
      'CHORD · ' +
      String(
        data.chordLabel ||
        data.label ||
        ''
      );


    subtitle.textContent =
      String(
        data.durationA8
      ) +
      ' A8s · MIX ' +
      Math.round(
        Number(
          data.gain ??
          0.35
        ) *
        100
      ) +
      '%';


    /*
     * Chord pitches are selected together from
     * the chord library. Do not show one member's
     * pitch as though it were the whole chord.
     */

    a8PlasticHideHeading(
      'PITCH'
    );


    a8PlasticHideHeading(
      'VOICE'
    );


    if (next) {
      next.hidden =
        false;
    }


    if (nextButton) {
      nextButton.textContent =
        'CHORD';


      delete nextButton.dataset
        .a8AddNextNote;


      nextButton.dataset
        .a8PlasticNext =
          'C';
    }


    if (restButton) {
      restButton.hidden =
        true;
    }


    if (deleteButton) {
      deleteButton.textContent =
        'DELETE CHORD';
    }


    if (audition) {
      audition.hidden =
        true;
    }


    if (auditionAll) {
      auditionAll.hidden =
        true;
    }
  }


  /*
   * Composer B/C selection.
   */

  window.addEventListener(
    'a8-arranger-layer-selected',
    event => {

      if (!event.detail) {
        return;
      }


      openNote(
        event.detail
      );


      a8PlasticSyncPopup(
        event.detail
      );
    }
  );


  /*
   * Existing update event is reused after every edit.
   */

  window.addEventListener(
    'a8-arranger-note-updated',
    event => {

      if (
        !root.hidden &&
        event.detail &&
        [
          'B',
          'C'
        ].includes(
          event.detail.layer
        )
      ) {

        a8PlasticSyncPopup(
          event.detail
        );
      }
    }
  );


  /*
   * Returning to Layer A restores ordinary note/rest UI.
   */

  window.addEventListener(
    'a8-arranger-note-selected',
    event => {

      if (
        event.detail
      ) {

        a8PlasticPopupLayer =
          null;


        a8PlasticSyncPopup(
          event.detail
        );
      }
    }
  );


  window.addEventListener(
    'a8-arranger-layer-deleted',
    () => {

      a8PlasticPopupLayer =
        null;


      a8PlasticRestoreSections();


      close();
    }
  );


  /*
   * ADD NEXT is intercepted only for B/C.
   *
   * Existing A NOTE/REST behavior remains untouched.
   */

  root.addEventListener(
    'click',
    event => {

      if (
        ![
          'B',
          'C'
        ].includes(
          a8PlasticPopupLayer
        )
      ) {
        return;
      }


      const add =
        event.target.closest(
          '[data-a8-plastic-next]'
        );


      if (!add) {
        return;
      }


      const layer =
        add.dataset
          .a8PlasticNext;


      if (
        layer !==
          a8PlasticPopupLayer
      ) {
        return;
      }


      event.preventDefault();
      event.stopImmediatePropagation();


      try {

        api.a8PlasticAddNext();

      } catch (
        error
      ) {

        message(
          error?.message ||
          String(
            error
          ),
          true
        );
      }
    },
    true
  );

  /* A8-ARRANGER-PLASTIC-ABC-V2-END */



  /* A8-ARRANGER-UNIVERSAL-ADD-NEXT-V4-BEGIN */

  /*
   * ==========================================================
   * ONE POPUP · FOUR PERMANENT ADD NEXT CHOICES
   * ==========================================================
   *
   * Popup origin remains explicit:
   *
   *   A
   *   B
   *   C
   *
   * Selection supplies temporal context.
   * Button supplies new material type.
   */


  let a8UniversalAnchorLayer =
    null;


  function a8UniversalNextSection() {

    return (
      root.querySelector(
        '[data-a8-add-next-section]'
      )
    );
  }


  function a8UniversalRefreshNext() {

    const next =
      a8UniversalNextSection();


    if (!next) {
      return;
    }


    next.hidden =
      false;


    const restLabel =
      a8UniversalAnchorLayer ===
        'C'
        ? 'C REST'
        : 'A REST';


    next.innerHTML = `
      <h3>
        ADD NEXT
      </h3>

      <div class="a8-arranger-grid">

        <button
          type="button"
          class="a8-arranger-choice"
          data-a8-universal-next="A-NOTE"
        >
          A NOTE
        </button>

        <button
          type="button"
          class="a8-arranger-choice"
          data-a8-universal-next="REST"
        >
          ${restLabel}
        </button>

        <button
          type="button"
          class="a8-arranger-choice"
          data-a8-universal-next="B-BEAT"
        >
          B BEAT
        </button>

        <button
          type="button"
          class="a8-arranger-choice"
          data-a8-universal-next="C-CHORD"
        >
          C CHORD
        </button>

      </div>
    `;
  }


  function a8UniversalOpenANote() {

    note =
      null;


    insertTarget =
      a8UniversalAnchorLayer ===
        'A'
        ? {
            afterSelected:
              true
          }
        : {
            appendLane:
              'A'
          };


    insertOctave =
      null;


    root.hidden =
      false;


    title.textContent =
      'ADD A NOTE';


    subtitle.textContent =
      a8UniversalAnchorLayer ===
        'A'
        ? 'AFTER SELECTED'
        : 'LAYER A · END';


    noteStep.hidden =
      true;


    a8SetInsertRestVisible(
      false
    );


    $$(
      '[data-a8-octave]'
    ).forEach(
      button =>
        button.classList
          .remove(
            'is-selected'
          )
    );


    showView(
      'insert'
    );
  }


  /*
   * Layer A selection.
   */
  window.addEventListener(
    'a8-arranger-note-selected',
    event => {

      if (!event.detail) {
        return;
      }


      a8UniversalAnchorLayer =
        'A';


      a8UniversalRefreshNext();
    }
  );


  /*
   * B/C selection.
   * Preserve exact source layer.
   */
  window.addEventListener(
    'a8-arranger-layer-selected',
    event => {

      if (!event.detail) {
        return;
      }


      a8UniversalAnchorLayer =
        event.detail.layer ||
        null;


      a8UniversalRefreshNext();
    }
  );


  window.addEventListener(
    'a8-arranger-note-updated',
    event => {

      if (
        !root.hidden &&
        event.detail
      ) {
        a8UniversalRefreshNext();
      }
    }
  );


  root.addEventListener(
    'click',
    event => {

      const button =
        event.target.closest(
          '[data-a8-universal-next]'
        );


      if (!button) {
        return;
      }


      event.preventDefault();
      event.stopImmediatePropagation();


      const route =
        button.dataset
          .a8UniversalNext;


      try {

        if (
          route ===
            'A-NOTE'
        ) {

          a8UniversalOpenANote();

          return;
        }


        if (
          route ===
            'REST'
        ) {

          if (
            a8UniversalAnchorLayer ===
              'A'
          ) {

            run(
              () =>
                api
                  .insertRestAfterSelected(),
              'A REST ADDED NEXT'
            );


            return;
          }


          if (
            a8UniversalAnchorLayer ===
              'C'
          ) {

            run(
              () =>
                api
                  .a8UniversalInsertCRest(
                    16
                  ),
              'C REST · 1 A8s ADDED NEXT'
            );


            return;
          }


          /*
           * B-origin REST semantics remain unchanged
           * for now.
           */
          run(
            () =>
              api
                .a8UniversalAppendRest(),
            'A REST ADDED'
          );


          return;
        }


        if (
          route ===
            'B-BEAT'
        ) {

          api
            .a8UniversalOpenAppend(
              'B',
              a8UniversalAnchorLayer ===
                'A'
            );


          return;
        }


        if (
          route ===
            'C-CHORD'
        ) {

          if (
            a8UniversalAnchorLayer ===
              'C'
          ) {

            api
              .a8UniversalOpenAfterSelectedC();

          } else {

            api
              .a8UniversalOpenAppend(
                'C',
                a8UniversalAnchorLayer ===
                  'A'
              );
          }


          return;
        }


        throw new Error(
          'UNKNOWN ADD NEXT ROUTE'
        );

      } catch (
        error
      ) {

        message(
          error?.message ||
          String(
            error
          ),
          true
        );
      }
    },
    true
  );


  if (!root.hidden) {
    a8UniversalRefreshNext();
  }

  /* A8-ARRANGER-UNIVERSAL-ADD-NEXT-V4-END */




  /* A8-ARRANGER-C-COARSE-TIMING-V1-BEGIN */

  /*
   * Fine timing already exists:
   *
   *   -1/16 / +1/16
   *
   * C gets additional coarse timing:
   *
   *   -1 A8s / +1 A8s
   *
   * 1 A8s = 16 native slots.
   */


  function a8InstallChordCoarseTiming() {

    const main =
      root.querySelector(
        '[data-a8-view="main"]'
      );


    if (!main) {
      throw new Error(
        'ARRANGER MAIN VIEW NOT FOUND'
      );
    }


    if (
      main.querySelector(
        '[data-a8-chord-coarse]'
      )
    ) {
      return;
    }


    const section =
      document.createElement(
        'div'
      );


    section.className =
      'a8-arranger-section';


    section.dataset
      .a8ChordCoarse =
        '1';


    section.hidden =
      true;


    section.innerHTML = `
      <h3>
        TIMING · COARSE
      </h3>

      <div class="a8-arranger-grid">

        <button
          type="button"
          class="a8-arranger-choice"
          data-a8-chord-coarse-step="-16"
        >
          − 1 A8s
        </button>

        <button
          type="button"
          class="a8-arranger-choice"
          data-a8-chord-coarse-step="16"
        >
          + 1 A8s
        </button>

      </div>
    `;


    const next =
      main.querySelector(
        '[data-a8-add-next-section]'
      );


    const deleteButton =
      main.querySelector(
        '[data-a8-action="delete"]'
      );


    if (next) {
      next.before(
        section
      );
    } else if (
      deleteButton
    ) {
      deleteButton.before(
        section
      );
    } else {
      main.append(
        section
      );
    }
  }


  function a8SyncChordCoarseTiming() {

    const section =
      root.querySelector(
        '[data-a8-chord-coarse]'
      );


    if (!section) {
      return;
    }


    section.hidden =
      a8UniversalAnchorLayer !==
        'C';
  }


  a8InstallChordCoarseTiming();


  window.addEventListener(
    'a8-arranger-note-selected',
    a8SyncChordCoarseTiming
  );


  window.addEventListener(
    'a8-arranger-layer-selected',
    a8SyncChordCoarseTiming
  );


  window.addEventListener(
    'a8-arranger-note-updated',
    a8SyncChordCoarseTiming
  );


  root.addEventListener(
    'click',
    event => {

      const button =
        event.target.closest(
          '[data-a8-chord-coarse-step]'
        );


      if (!button) {
        return;
      }


      if (
        a8UniversalAnchorLayer !==
          'C'
      ) {
        return;
      }


      event.preventDefault();
      event.stopImmediatePropagation();


      const step =
        Number(
          button.dataset
            .a8ChordCoarseStep
        );


      if (
        ![
          -16,
          16
        ].includes(
          step
        )
      ) {
        message(
          'INVALID C COARSE TIMING STEP',
          true
        );

        return;
      }


      run(
        () =>
          api.adjustDuration(
            step
          ),
        step <
          0
          ? 'C TIMING − 1 A8s'
          : 'C TIMING + 1 A8s'
      );
    },
    true
  );


  a8SyncChordCoarseTiming();

  /* A8-ARRANGER-C-COARSE-TIMING-V1-END */



  /* A8-ARRANGER-DELETE-LAST-INPUT-V1-BEGIN */

  /*
   * One-step creation backspace.
   *
   * Separate from DELETE NOTE / BEAT / CHORD.
   */


  function a8InstallDeleteLastInput() {

    const main =
      root.querySelector(
        '[data-a8-view="main"]'
      );


    if (!main) {
      throw new Error(
        'ARRANGER MAIN VIEW NOT FOUND'
      );
    }


    if (
      main.querySelector(
        '[data-a8-delete-last-input]'
      )
    ) {
      return;
    }


    const section =
      document.createElement(
        'div'
      );


    section.className =
      'a8-arranger-section';


    section.dataset
      .a8DeleteLastInput =
        '1';


    section.innerHTML = `
      <button
        type="button"
        class="a8-arranger-choice"
        data-a8-delete-last-input-button
        disabled
      >
        DELETE LAST INPUT
      </button>
    `;


    const next =
      main.querySelector(
        '[data-a8-add-next-section]'
      );


    if (next) {

      next.after(
        section
      );

    } else {

      main.append(
        section
      );
    }
  }


  function a8SyncDeleteLastInput(
    detail =
      null
  ) {

    const button =
      root.querySelector(
        '[data-a8-delete-last-input-button]'
      );


    if (!button) {
      return;
    }


    const available =
      Boolean(
        detail &&
        detail.available
      );


    const label =
      (
        detail &&
        detail.label
      )
        ? String(
            detail.label
          )
        : '';


    button.disabled =
      !available;


    button.textContent =
      (
        available &&
        label
      )
        ? (
            'DELETE LAST INPUT · ' +
            label
          )
        : 'DELETE LAST INPUT';
  }


  a8InstallDeleteLastInput();


  a8SyncDeleteLastInput();


  window.addEventListener(
    'a8-last-input-state',
    event => {

      a8SyncDeleteLastInput(
        event.detail ||
        null
      );
    }
  );


  window.addEventListener(
    'a8-last-input-restored',
    () => {

      close();
    }
  );


  root.addEventListener(
    'click',
    event => {

      const button =
        event.target.closest(
          '[data-a8-delete-last-input-button]'
        );


      if (!button) {
        return;
      }


      event.preventDefault();
      event.stopImmediatePropagation();


      if (button.disabled) {
        return;
      }


      try {

        api
          .a8DeleteLastInput();

      } catch (
        error
      ) {

        message(
          error?.message ||
          String(
            error
          ),
          true
        );
      }
    },
    true
  );

  /* A8-ARRANGER-DELETE-LAST-INPUT-V1-END */



  /* A8-ARRANGER-UNIVERSAL-SILENCE-V1-BEGIN */

  /*
   * UNIVERSAL HUMAN-FACING NAME:
   *
   *   SILENCE
   *
   * A uses explicit REST internally.
   * B/C use actual empty native intervals.
   */


  let a8SilencePopupActive =
    false;


  function a8RenameUniversalSilence() {

    root
      .querySelectorAll(
        '[data-a8-universal-next="REST"]'
      )
      .forEach(
        button => {

          button.textContent =
            'SILENCE';
        }
      );
  }


  function a8InstallSilenceCoarse() {

    const main =
      root.querySelector(
        '[data-a8-view="main"]'
      );


    if (!main) {
      throw new Error(
        'ARRANGER MAIN VIEW NOT FOUND'
      );
    }


    if (
      main.querySelector(
        '[data-a8-silence-coarse]'
      )
    ) {
      return;
    }


    const section =
      document.createElement(
        'div'
      );


    section.className =
      'a8-arranger-section';


    section.dataset
      .a8SilenceCoarse =
        '1';


    section.hidden =
      true;


    section.innerHTML = `
      <h3>
        SILENCE · COARSE
      </h3>

      <div class="a8-arranger-grid">

        <button
          type="button"
          class="a8-arranger-choice"
          data-a8-silence-step="-16"
        >
          − 1 A8s
        </button>

        <button
          type="button"
          class="a8-arranger-choice"
          data-a8-silence-step="16"
        >
          + 1 A8s
        </button>

      </div>
    `;


    const next =
      main.querySelector(
        '[data-a8-add-next-section]'
      );


    if (next) {

      next.before(
        section
      );

    } else {

      main.append(
        section
      );
    }
  }


  function a8SilenceCoarseSection() {

    return (
      root.querySelector(
        '[data-a8-silence-coarse]'
      )
    );
  }


  function a8HideSilenceCoarse() {

    const section =
      a8SilenceCoarseSection();


    if (section) {

      section.hidden =
        true;
    }
  }


  function a8ShowSilenceCoarse() {

    const section =
      a8SilenceCoarseSection();


    if (section) {

      section.hidden =
        false;
    }
  }


  function a8OpenSilence(
    data
  ) {

    if (
      !data ||
      data.objectKind !==
        'SILENCE'
    ) {
      return;
    }


    a8SilencePopupActive =
      true;


    /*
     * Supply universal temporal/lane context.
     */
    a8UniversalAnchorLayer =
      data.layer;


    openNote(
      data
    );


    title.textContent =
      'SILENCE · LAYER ' +
      data.layer;


    subtitle.textContent =
      String(
        data.durationA8
      ) +
      ' A8s';


    const deleteButton =
      root.querySelector(
        '[data-a8-action="delete"]'
      );


    if (deleteButton) {

      deleteButton.textContent =
        'DELETE SILENCE';
    }


    /*
     * Do not show C chord coarse controls while
     * editing a C SILENCE field.
     */
    const chordCoarse =
      root.querySelector(
        '[data-a8-chord-coarse]'
      );


    if (chordCoarse) {

      chordCoarse.hidden =
        true;
    }


    a8ShowSilenceCoarse();


    a8UniversalRefreshNext();


    a8RenameUniversalSilence();
  }


  a8InstallSilenceCoarse();


  /*
   * V4 may rebuild ADD NEXT.
   * Rename REST to universal SILENCE afterward.
   */
  window.addEventListener(
    'a8-arranger-note-selected',
    () => {

      a8SilencePopupActive =
        false;


      a8HideSilenceCoarse();


      window.setTimeout(
        a8RenameUniversalSilence,
        0
      );
    }
  );


  window.addEventListener(
    'a8-arranger-layer-selected',
    () => {

      a8SilencePopupActive =
        false;


      a8HideSilenceCoarse();


      window.setTimeout(
        a8RenameUniversalSilence,
        0
      );
    }
  );


  window.addEventListener(
    'a8-arranger-note-updated',
    () => {

      window.setTimeout(
        a8RenameUniversalSilence,
        0
      );
    }
  );


  window.addEventListener(
    'a8-arranger-silence-selected',
    event => {

      a8OpenSilence(
        event.detail
      );
    }
  );


  window.addEventListener(
    'a8-arranger-silence-deleted',
    () => {

      a8SilencePopupActive =
        false;


      a8HideSilenceCoarse();


      close();
    }
  );


  root.addEventListener(
    'click',
    event => {

      const button =
        event.target.closest(
          '[data-a8-silence-step]'
        );


      if (!button) {
        return;
      }


      if (!a8SilencePopupActive) {
        return;
      }


      event.preventDefault();
      event.stopImmediatePropagation();


      const step =
        Number(
          button.dataset
            .a8SilenceStep
        );


      if (
        step !==
          -16 &&
        step !==
          16
      ) {

        message(
          'INVALID SILENCE STEP',
          true
        );


        return;
      }


      run(
        () =>
          api.adjustDuration(
            step
          ),
        step <
          0
          ? 'SILENCE − 1 A8s'
          : 'SILENCE + 1 A8s'
      );
    },
    true
  );


  /*
   * Initial V4 row.
   */
  a8RenameUniversalSilence();

  /* A8-ARRANGER-UNIVERSAL-SILENCE-V1-END */


  /* A8-ARRANGER-AUDITION-BAR-V1-BEGIN */

  /*
   * Standard audition ladder:
   *
   *   AUDITION
   *   AUDITION BAR
   *   AUDITION ALL
   *
   * AUDITION BAR is always meaningful because it refers
   * to the current Composer window, not merely the
   * currently selected sound object.
   */


  function a8InstallAuditionBar() {

    const main =
      root.querySelector(
        '[data-a8-view="main"]'
      );


    if (!main) {
      throw new Error(
        'ARRANGER MAIN VIEW NOT FOUND'
      );
    }


    if (
      main.querySelector(
        '[data-a8-action="audition-bar"]'
      )
    ) {
      return;
    }


    const auditionAll =
      main.querySelector(
        '[data-a8-action="audition-all"]'
      );


    if (!auditionAll) {
      throw new Error(
        'AUDITION ALL CONTROL NOT FOUND'
      );
    }


    const button =
      auditionAll.cloneNode(
        true
      );


    button.dataset
      .a8Action =
        'audition-bar';


    button.textContent =
      '▶ AUDITION BAR';


    button.hidden =
      false;


    auditionAll.before(
      button
    );
  }


  a8InstallAuditionBar();


  /*
   * Keep BAR audition visible regardless of whether
   * NOTE / REST / BEAT / CHORD is currently selected.
   */

  function a8ShowAuditionBar() {

    const button =
      root.querySelector(
        '[data-a8-action="audition-bar"]'
      );


    if (button) {
      button.hidden =
        false;
    }
  }


  window.addEventListener(
    'a8-arranger-note-selected',
    a8ShowAuditionBar
  );


  window.addEventListener(
    'a8-arranger-layer-selected',
    a8ShowAuditionBar
  );


  window.addEventListener(
    'a8-arranger-note-updated',
    a8ShowAuditionBar
  );


  root.addEventListener(
    'click',
    event => {

      const button =
        event.target.closest(
          '[data-a8-action="audition-bar"]'
        );


      if (!button) {
        return;
      }


      event.preventDefault();
      event.stopImmediatePropagation();


      window.dispatchEvent(
        new CustomEvent(
          'a8-arranger-audition-bar'
        )
      );
    },
    true
  );

  /* A8-ARRANGER-AUDITION-BAR-V1-END */


})();
