(() => {
  'use strict';

  /*
   * A8 COMPOSER V0.4
   *
   * SCORE MODEL
   * ===========
   *
   * BAR
   *   4 A8 seconds
   *   64 × 1/16 native slots
   *
   * NOTE
   *   exact pitch · cycles / A8 second
   *   exact duration · native slots
   *
   * REST
   *   exact duration · native slots
   *
   * Drag/drop determines only score ordering.
   * It is NEVER timing authority.
   *
   * After every edit:
   *
   * event sequence
   *      ↓
   * exact slot arithmetic
   *      ↓
   * exact A8 START / END
   *
   * Browser coordinates never become
   * musical time.
   */

  const $ =
    id =>
      document.getElementById(id);


  const BAR_SLOTS = 64;

  const BAR_LENGTH_A8 = '4';

  const SLOT_A8 = '1/16';


  const DURATIONS = [
    '1/16',
    '1/8',
    '1/4',
    '1/2',
    '1',
    '2',
    '4'
  ];


  const NOTE_REFERENCE = [
    ['A',  '290'],
    ['A#', '307'],
    ['B',  '325'],
    ['C',  '345'],
    ['C#', '365'],
    ['D',  '387'],
    ['D#', '410'],
    ['E',  '435'],
    ['F',  '460'],
    ['F#', '487'],
    ['G',  '516'],
    ['G#', '548']
  ];


  const OCTAVES = [
    -2,
    -1,
    0,
    1,
    2
  ];


  const JOVIAN_PITCH = {
    IO: {
      noteName: 'G#',
      octaveShift: 0,
      pitch: '548',
      waveform: 'sawtooth',
      motion: 'whoosh',
      gain: 0.42
    },

    EUROPA: {
      noteName: 'E',
      octaveShift: 0,
      pitch: '435',
      waveform: 'triangle',
      motion: 'rise',
      gain: 0.50
    },

    GANYMEDE: {
      noteName: 'A',
      octaveShift: 0,
      pitch: '290',
      waveform: 'sine',
      motion: 'fall',
      gain: 0.58
    },

    JUPITER: {
      noteName: 'A',
      octaveShift: -1,
      pitch: '145',
      waveform: 'triangle',
      motion: 'steady',
      gain: 0.72
    }
  };


  let jovianBase =
    '1/4';


  let nextBarId =
    1;


  let nextEventId =
    1;


  let bars = [
    makeBar()
  ];


  let activeBarId =
    bars[0].id;


  let selected = null;


  /*
   * Last-used settings become the
   * defaults for newly dragged notes.
   */
  const insertDefaults = {
    durationA8: '1/4',
    waveform: 'sine',
    motion: 'steady',
    gain: 0.50
  };


  function gcd(
    a,
    b
  ) {
    a = Math.abs(a);
    b = Math.abs(b);

    while (b) {
      [
        a,
        b
      ] = [
        b,
        a % b
      ];
    }

    return a || 1;
  }


  function frac(
    value
  ) {
    if (
      Array.isArray(value)
    ) {
      const g =
        gcd(
          value[0],
          value[1]
        );

      return [
        value[0] / g,
        value[1] / g
      ];
    }


    const s =
      String(value ?? '')
        .trim();


    if (!s) {
      throw new Error(
        'EXACT VALUE REQUIRED'
      );
    }


    if (
      s.includes('/')
    ) {
      const parts =
        s.split('/');

      if (
        parts.length !== 2
      ) {
        throw new Error(
          'INVALID FRACTION · ' +
          s
        );
      }


      const n =
        Number(parts[0]);

      const d =
        Number(parts[1]);


      if (
        !Number.isInteger(n) ||
        !Number.isInteger(d) ||
        d === 0
      ) {
        throw new Error(
          'INVALID FRACTION · ' +
          s
        );
      }


      return frac([
        n,
        d
      ]);
    }


    const n =
      Number(s);


    if (
      !Number.isInteger(n)
    ) {
      throw new Error(
        'USE INTEGER OR EXACT FRACTION'
      );
    }


    return [
      n,
      1
    ];
  }


  function fracText(
    value
  ) {
    const x =
      frac(value);

    return (
      x[1] === 1
        ? String(x[0])
        : x[0] +
          '/' +
          x[1]
    );
  }


  function mulFrac(
    value,
    n,
    d = 1
  ) {
    const x =
      frac(value);

    return frac([
      x[0] * n,
      x[1] * d
    ]);
  }


  function slotsForDuration(
    durationA8
  ) {
    const x =
      frac(
        durationA8
      );

    const numerator =
      x[0] * 16;


    if (
      numerator %
      x[1] !== 0
    ) {
      throw new Error(
        'DURATION MUST LAND ON 1/16 A8 SLOT GRID'
      );
    }


    const slots =
      numerator /
      x[1];


    if (
      !Number.isInteger(slots) ||
      slots < 1 ||
      slots > BAR_SLOTS
    ) {
      throw new Error(
        'INVALID NATIVE SLOT DURATION'
      );
    }


    return slots;
  }


  function a8ForSlots(
    slots
  ) {
    return fracText([
      slots,
      16
    ]);
  }


  function makeBar() {
    return {
      id:
        nextBarId++,

      complete:
        false,

      events:
        []
    };
  }


  function activeBar() {
    return (
      bars.find(
        bar =>
          bar.id ===
          activeBarId
      ) ||
      null
    );
  }


  function barById(
    id
  ) {
    return (
      bars.find(
        bar =>
          bar.id === id
      ) ||
      null
    );
  }


  function usedSlots(
    bar
  ) {
    return (
      bar.events.reduce(
        (
          total,
          event
        ) =>
          total +
          slotsForDuration(
            event.durationA8
          ),
        0
      )
    );
  }


  function remainingSlots(
    bar
  ) {
    return (
      BAR_SLOTS -
      usedSlots(bar)
    );
  }


  function barTimeline(
    bar
  ) {
    let slot =
      0;


    return (
      bar.events.map(
        event => {

          const slots =
            slotsForDuration(
              event.durationA8
            );

          const out = {
            ...event,

            startSlot:
              slot,

            endSlot:
              slot + slots,

            slots,

            startA8:
              a8ForSlots(
                slot
              ),

            endA8:
              a8ForSlots(
                slot +
                slots
              )
          };


          slot +=
            slots;


          return out;
        }
      )
    );
  }


  function noteReferencePitch(
    noteName
  ) {
    const row =
      NOTE_REFERENCE.find(
        item =>
          item[0] ===
          noteName
      );


    if (!row) {
      throw new Error(
        'UNKNOWN NOTE ' +
        noteName
      );
    }


    return row[1];
  }


  function pitchForOctave(
    noteName,
    shift
  ) {
    const base =
      noteReferencePitch(
        noteName
      );


    if (
      shift === 0
    ) {
      return base;
    }


    if (
      shift > 0
    ) {
      return fracText(
        mulFrac(
          base,
          2 ** shift,
          1
        )
      );
    }


    return fracText(
      mulFrac(
        base,
        1,
        2 ** Math.abs(
          shift
        )
      )
    );
  }


  function octaveText(
    shift
  ) {
    return (
      'A8 ' +
      (
        shift > 0
          ? '+' + shift
          : String(shift)
      )
    );
  }


  function makeNote(
    source
  ) {
    return {
      id:
        nextEventId++,

      type:
        'note',

      noteName:
        source.noteName,

      octaveShift:
        Number(
          source.octaveShift
        ),

      cyclesPerA8Second:
        fracText(
          source.pitch
        ),

      durationA8:
        insertDefaults
          .durationA8,

      waveform:
        source.waveform ||
        insertDefaults
          .waveform,

      motion:
        source.motion ||
        insertDefaults
          .motion,

      gain:
        Number(
          source.gain ??
          insertDefaults.gain
        ),

      label:
        source.label ||
        (
          source.noteName +
          ' · ' +
          octaveText(
            Number(
              source.octaveShift
            )
          )
        )
    };
  }


  function makeRest(
    durationA8 =
      insertDefaults.durationA8
  ) {
    return {
      id:
        nextEventId++,

      type:
        'rest',

      label:
        'Rest',

      durationA8:
        fracText(
          durationA8
        )
    };
  }


  function selectedEvent() {
    if (!selected) {
      return null;
    }


    const bar =
      barById(
        selected.barId
      );


    if (!bar) {
      return null;
    }


    const event =
      bar.events.find(
        item =>
          item.id ===
          selected.eventId
      );


    if (!event) {
      return null;
    }


    return {
      bar,
      event
    };
  }


  function selectEvent(
    barId,
    eventId
  ) {
    activeBarId =
      barId;

    selected = {
      barId,
      eventId
    };

    render();
  }


  function canInsert(
    bar,
    event
  ) {
    return (
      usedSlots(bar) +
      slotsForDuration(
        event.durationA8
      ) <=
      BAR_SLOTS
    );
  }


  function insertEvent(
    bar,
    event,
    index =
      bar.events.length
  ) {
    if (
      !canInsert(
        bar,
        event
      )
    ) {
      throw new Error(
        'BAR FULL · ' +
        a8ForSlots(
          remainingSlots(bar)
        ) +
        ' A8s REMAINING'
      );
    }


    bar.complete =
      false;


    bar.events.splice(
      index,
      0,
      event
    );


    selected = {
      barId:
        bar.id,

      eventId:
        event.id
    };


    render();
  }


  function deleteSelected() {
    const found =
      selectedEvent();


    if (!found) {
      return;
    }


    const index =
      found.bar.events.findIndex(
        item =>
          item.id ===
          found.event.id
      );


    found.bar.events.splice(
      index,
      1
    );


    found.bar.complete =
      false;


    selected =
      null;


    render();
  }


  let nextAutoTieId =
    1;


  function makeAutoTieId() {
    return (
      'AUTO-TIE-' +
      nextAutoTieId++
    );
  }


  function findNextBar(
    bar
  ) {
    const index =
      bars.findIndex(
        candidate =>
          candidate.id ===
          bar.id
      );


    if (index < 0) {
      throw new Error(
        'BAR NOT FOUND'
      );
    }


    let next =
      bars[
        index + 1
      ];


    if (!next) {
      next =
        makeBar();

      bars.splice(
        index + 1,
        0,
        next
      );
    }


    return {
      bar:
        next,

      index:
        index + 1
    };
  }


  /*
   * Desired duration is always the total musical
   * duration requested by the composer.
   *
   * If it crosses a barline, split the score
   * accounting exactly at that boundary and create
   * one explicit tie between the two pieces.
   */
  function setSelectedDuration(
    duration
  ) {
    const found =
      selectedEvent();


    if (!found) {
      return;
    }


    const requested =
      fracText(
        duration
      );

    const requestedSlots =
      slotsForDuration(
        requested
      );


    const timed =
      barTimeline(
        found.bar
      ).find(
        event =>
          event.id ===
          found.event.id
      );


    if (!timed) {
      throw new Error(
        'SELECTED EVENT TIMING NOT FOUND'
      );
    }


    const eventIndex =
      found.bar.events.findIndex(
        event =>
          event.id ===
          found.event.id
      );


    const capacity =
      BAR_SLOTS -
      timed.startSlot;


    /*
     * Normal in-bar edit.
     */
    if (
      requestedSlots <=
      capacity
    ) {
      const old =
        found.event.durationA8;


      found.event.durationA8 =
        requested;


      if (
        usedSlots(
          found.bar
        ) >
        BAR_SLOTS
      ) {
        found.event.durationA8 =
          old;

        throw new Error(
          'DURATION WOULD EXCEED BAR'
        );
      }


      found.bar.complete =
        false;

      insertDefaults.durationA8 =
        requested;


      render();

      return;
    }


    /*
     * REST overflow follows the same exact
     * bar-accounting rule as NOTE overflow,
     * but requires no tie metadata because
     * continuous silence has no articulation.
     */
    if (
      found.event.type ===
        'rest'
    ) {
      if (
        eventIndex !==
        found.bar.events.length - 1
      ) {
        throw new Error(
          'CROSS-BAR REST MUST BE FINAL EVENT'
        );
      }


      const overflow =
        requestedSlots -
        capacity;


      const next =
        findNextBar(
          found.bar
        );


      if (
        remainingSlots(
          next.bar
        ) <
        overflow
      ) {
        throw new Error(
          'NEXT BAR HAS INSUFFICIENT ROOM FOR REST CONTINUATION'
        );
      }


      /*
       * Current bar owns exactly the silence
       * remaining before its barline.
       */
      found.event.durationA8 =
        a8ForSlots(
          capacity
        );


      delete found.event.tieId;
      delete found.event.tiePrev;
      delete found.event.tieNext;


      /*
       * Next bar owns the exact remaining silence.
       */
      const continuation = {
        ...found.event,

        id:
          nextEventId++,

        durationA8:
          a8ForSlots(
            overflow
          )
      };


      delete continuation.tieId;
      delete continuation.tiePrev;
      delete continuation.tieNext;


      next.bar.events.unshift(
        continuation
      );


      found.bar.complete =
        usedSlots(
          found.bar
        ) ===
        BAR_SLOTS;

      next.bar.complete =
        false;


      activeBarId =
        next.bar.id;


      selected = {
        barId:
          next.bar.id,

        eventId:
          continuation.id
      };


      insertDefaults.durationA8 =
        requested;


      render();


      showMessage(
        requested +
        ' REST · CONTINUED · ' +
        a8ForSlots(
          capacity
        ) +
        ' HERE + ' +
        a8ForSlots(
          overflow
        ) +
        ' IN BAR ' +
        (
          next.index +
          1
        ),
        true
      );


      return;
    }


    /*
     * Never silently push a later event across a
     * boundary. Cross-bar expansion is allowed only
     * for the final event in the bar.
     */
    if (
      eventIndex !==
      found.bar.events.length - 1
    ) {
      throw new Error(
        'CROSS-BAR NOTE MUST BE FINAL EVENT'
      );
    }


    const overflow =
      requestedSlots -
      capacity;


    const next =
      findNextBar(
        found.bar
      );


    if (
      remainingSlots(
        next.bar
      ) <
      overflow
    ) {
      throw new Error(
        'NEXT BAR HAS INSUFFICIENT ROOM FOR CONTINUATION'
      );
    }


    const tieId =
      makeAutoTieId();


    /*
     * Current bar owns exactly the slots remaining
     * from the note start to its barline.
     */
    found.event.durationA8 =
      a8ForSlots(
        capacity
      );

    found.event.tieId =
      tieId;

    found.event.tiePrev =
      false;

    found.event.tieNext =
      true;


    /*
     * Next bar owns only the exact overflow.
     * Expression is cloned so the two score pieces
     * describe one physically continuous voice.
     */
    const continuation = {
      ...found.event,

      id:
        nextEventId++,

      durationA8:
        a8ForSlots(
          overflow
        ),

      tieId,

      tiePrev:
        true,

      tieNext:
        false
    };


    next.bar.events.unshift(
      continuation
    );


    found.bar.complete =
      usedSlots(
        found.bar
      ) ===
      BAR_SLOTS;

    next.bar.complete =
      false;


    activeBarId =
      next.bar.id;


    selected = {
      barId:
        next.bar.id,

      eventId:
        continuation.id
    };


    /*
     * The working duration remains the total duration
     * requested by the musician, not merely the second
     * piece.
     */
    insertDefaults.durationA8 =
      requested;


    render();


    showMessage(
      requested +
      ' NOTE · AUTO TIE · ' +
      a8ForSlots(
        capacity
      ) +
      ' HERE + ' +
      a8ForSlots(
        overflow
      ) +
      ' IN BAR ' +
      (
        next.index +
        1
      ),
      true
    );
  }


  function adjustSelectedDuration(
    deltaSlots
  ) {
    const found =
      selectedEvent();


    if (!found) {
      return;
    }


    const currentSlots =
      slotsForDuration(
        found.event.durationA8
      );

    const nextSlots =
      currentSlots +
      Number(
        deltaSlots
      );


    if (
      !Number.isInteger(
        nextSlots
      ) ||
      nextSlots < 1 ||
      nextSlots > BAR_SLOTS
    ) {
      throw new Error(
        'DURATION LIMIT · 1/16 TO 4 A8s'
      );
    }


    setSelectedDuration(
      a8ForSlots(
        nextSlots
      )
    );
  }


  function fillBarWithRest(
    bar
  ) {
    const remaining =
      remainingSlots(
        bar
      );


    if (
      remaining <= 0
    ) {
      showMessage(
        'BAR ALREADY FULL',
        true
      );

      return;
    }


    const rest =
      makeRest(
        a8ForSlots(
          remaining
        )
      );


    insertEvent(
      bar,
      rest
    );


    showMessage(
      'EXACT REST FILLED ' +
      a8ForSlots(
        remaining
      ) +
      ' A8s',
      true
    );
  }


  function clearBar(
    bar
  ) {
    if (!bar) {
      throw new Error(
        'BAR NOT FOUND'
      );
    }


    const index =
      bars.findIndex(
        candidate =>
          candidate.id ===
          bar.id
      );


    if (index < 0) {
      throw new Error(
        'BAR NOT FOUND'
      );
    }


    if (
      bar.events.length &&
      !window.confirm(
        'REMOVE ALL EVENTS FROM BAR ' +
        (
          index + 1
        ) +
        '?'
      )
    ) {
      return;
    }


    bar.events =
      [];


    bar.complete =
      false;


    activeBarId =
      bar.id;


    selected =
      null;


    render();


    showMessage(
      'BAR ' +
      (
        index + 1
      ) +
      ' CLEARED · 0 / 4 A8s',
      true
    );
  }


  function deleteBar(
    bar
  ) {
    if (!bar) {
      throw new Error(
        'BAR NOT FOUND'
      );
    }


    const index =
      bars.findIndex(
        candidate =>
          candidate.id ===
          bar.id
      );


    if (index < 0) {
      throw new Error(
        'BAR NOT FOUND'
      );
    }


    if (
      !window.confirm(
        'DELETE BAR ' +
        (
          index + 1
        ) +
        '?'
      )
    ) {
      return;
    }


    /*
     * Composer always retains at least
     * one editable bar.
     *
     * Deleting the final remaining bar
     * therefore resets BAR 1 instead of
     * producing a zero-bar document.
     */
    if (
      bars.length ===
      1
    ) {
      bar.events =
        [];


      bar.complete =
        false;


      activeBarId =
        bar.id;


      selected =
        null;


      render();


      showMessage(
        'ONLY BAR RESET · BAR 1 IS EMPTY',
        true
      );


      return;
    }


    bars.splice(
      index,
      1
    );


    /*
     * Bar numbering is derived from array
     * position. Removing BAR 3 therefore
     * causes old BAR 4 to become BAR 3,
     * etc. No stored timing value changes.
     */
    const nextIndex =
      Math.min(
        index,
        bars.length - 1
      );


    activeBarId =
      bars[
        nextIndex
      ].id;


    selected =
      null;


    render();


    showMessage(
      'BAR ' +
      (
        index + 1
      ) +
      ' DELETED · ' +
      bars.length +
      ' BAR' +
      (
        bars.length === 1
          ? ''
          : 'S'
      ) +
      ' REMAIN',
      true
    );
  }


  function moveBar(
    bar,
    delta
  ) {
    if (!bar) {
      throw new Error(
        'BAR NOT FOUND'
      );
    }


    if (
      !bar.complete
    ) {
      throw new Error(
        'FINISH BAR BEFORE REORDERING'
      );
    }


    if (
      delta !== -1 &&
      delta !== 1
    ) {
      throw new Error(
        'INVALID BAR MOVE'
      );
    }


    const sourceIndex =
      bars.findIndex(
        candidate =>
          candidate.id ===
          bar.id
      );


    if (
      sourceIndex < 0
    ) {
      throw new Error(
        'BAR NOT FOUND'
      );
    }


    const targetIndex =
      sourceIndex +
      delta;


    if (
      targetIndex < 0 ||
      targetIndex >=
        bars.length
    ) {
      return;
    }


    /*
     * TRUE SCORE-ORDER SWAP
     * ---------------------
     *
     * The complete bar objects move.
     *
     * Their notes, rests, exact durations,
     * pitch ratios, waveform, motion, gain
     * and completion state are untouched.
     *
     * UI pixels never become timing data.
     */

    [
      bars[sourceIndex],
      bars[targetIndex]
    ] = [
      bars[targetIndex],
      bars[sourceIndex]
    ];


    /*
     * Keep the bar that the musician moved
     * as the active bar after re-render.
     */
    activeBarId =
      bar.id;


    selected =
      null;


    render();


    showMessage(
      'BAR ' +
      (
        sourceIndex + 1
      ) +
      ' MOVED ' +
      (
        delta < 0
          ? 'EARLIER'
          : 'LATER'
      ) +
      ' · NOW BAR ' +
      (
        targetIndex + 1
      ),
      true
    );
  }


  function repeatBar(
    sourceBar
  ) {
    if (
      !sourceBar ||
      !sourceBar.events.length
    ) {
      throw new Error(
        'BAR HAS NOTHING TO REPEAT'
      );
    }


    const sourceIndex =
      bars.findIndex(
        bar =>
          bar.id ===
          sourceBar.id
      );


    if (
      sourceIndex < 0
    ) {
      throw new Error(
        'SOURCE BAR NOT FOUND'
      );
    }


    /*
     * REPEAT BAR
     * ----------
     *
     * This is an exact score-data clone.
     *
     * Notes, rests, native durations,
     * exact pitch, waveform, motion,
     * gain and ordering are copied.
     *
     * New internal IDs are issued so the
     * repeated bar remains independently
     * editable.
     *
     * No browser timing or playback loop
     * participates in this operation.
     */

    const copy =
      makeBar();


    copy.events =
      sourceBar.events.map(
        event => ({
          ...event,

          id:
            nextEventId++
        })
      );


    copy.complete =
      (
        sourceBar.complete &&
        usedSlots(copy) ===
          BAR_SLOTS
      );


    /*
     * Insert immediately after the source.
     *
     * Displayed bar numbers are derived from
     * list position, so:
     *
     * BAR 2 -> REPEAT -> new BAR 3
     *
     * Existing later bars simply move forward.
     */
    bars.splice(
      sourceIndex + 1,
      0,
      copy
    );


    activeBarId =
      copy.id;


    selected =
      null;


    render();


    showMessage(
      'BAR ' +
      (
        sourceIndex + 1
      ) +
      ' REPEATED AS BAR ' +
      (
        sourceIndex + 2
      ),
      true
    );
  }


  function finishBar(
    bar
  ) {
    if (
      usedSlots(bar) !==
      BAR_SLOTS
    ) {
      throw new Error(
        'BAR NOT COMPLETE · ' +
        a8ForSlots(
          remainingSlots(bar)
        ) +
        ' A8s REMAINING'
      );
    }


    bar.complete =
      true;


    selected =
      null;


    const index =
      bars.findIndex(
        item =>
          item.id ===
          bar.id
      );


    let next =
      bars[
        index + 1
      ];


    if (!next) {
      next =
        makeBar();

      bars.push(
        next
      );
    }


    activeBarId =
      next.id;


    render();


    showMessage(
      'BAR ' +
      (
        index + 1
      ) +
      ' FINISHED',
      true
    );
  }


  function renderLegend() {
    const host =
      $('notePalette');


    host.innerHTML =
      '';


    /*
     * REST is a true palette event.
     */
    const restRow =
      document.createElement(
        'div'
      );


    restRow.className =
      'palette-rest-row';


    restRow.innerHTML = `
      <button
        class="rest-source"
        draggable="true"
        data-palette-type="rest"
        title="Drag an explicit A8 rest into the open bar"
      >
        <strong>R</strong>
        <small>REST</small>
      </button>

      <div>
        <strong>Explicit rest</strong>
        <div class="sub">
          Drag R into the bar, then set its exact duration
          with the same TIME controller.
        </div>
      </div>
    `;


    host.appendChild(
      restRow
    );


    for (
      const shift
      of OCTAVES
    ) {
      const row =
        document.createElement(
          'div'
        );


      row.className =
        'palette-octave';


      const label =
        document.createElement(
          'div'
        );


      label.className =
        'octave-label';


      label.textContent =
        octaveText(
          shift
        );


      row.appendChild(
        label
      );


      const notes =
        document.createElement(
          'div'
        );


      notes.className =
        'palette-notes';


      for (
        const [
          noteName
        ]
        of NOTE_REFERENCE
      ) {
        const pitch =
          pitchForOctave(
            noteName,
            shift
          );


        const button =
          document.createElement(
            'button'
          );


        button.className =
          'note-source';


        button.draggable =
          true;


        button.dataset
          .paletteType =
            'note';


        button.dataset
          .noteName =
            noteName;


        button.dataset
          .octaveShift =
            String(
              shift
            );


        button.dataset
          .pitch =
            pitch;


        button.title =
          noteName +
          ' · ' +
          octaveText(
            shift
          ) +
          ' · ' +
          pitch +
          ' cycles/A8s';


        button.innerHTML = `
          <strong>${noteName}</strong>
          <small>${pitch}</small>
        `;


        notes.appendChild(
          button
        );
      }


      row.appendChild(
        notes
      );


      host.appendChild(
        row
      );
    }
  }


  function scoreNoteLabel(
    event
  ) {
    const name =
      event.noteName ||
      '●';


    /*
     * Reference octave 0 needs no label.
     *
     * Shifted octaves remain explicit once
     * the note leaves the palette:
     *
     * A
     * A +1
     * A -2
     */
    if (
      !event.noteName ||
      !Number.isInteger(
        event.octaveShift
      ) ||
      event.octaveShift === 0
    ) {
      return name;
    }


    return (
      name +
      ' ' +
      (
        event.octaveShift > 0
          ? '+' +
            event.octaveShift
          : String(
              event.octaveShift
            )
      )
    );
  }


  function renderBars() {
    const host =
      $('bars');


    host.innerHTML =
      '';


    bars.forEach(
      (
        bar,
        index
      ) => {

        const active =
          bar.id ===
          activeBarId;


        const used =
          usedSlots(bar);


        const card =
          document.createElement(
            'article'
          );


        card.className =
          'bar-card' +
          (
            active
              ? ' active'
              : ''
          ) +
          (
            bar.complete
              ? ' complete'
              : ''
          );


        card.dataset.barId =
          String(
            bar.id
          );


        const noteCount =
          bar.events.filter(
            event =>
              event.type ===
              'note'
          ).length;


        const restCount =
          bar.events.filter(
            event =>
              event.type ===
              'rest'
          ).length;


        const status =
          bar.complete
            ? '✓ COMPLETE'
            : (
                used ===
                BAR_SLOTS
                  ? 'READY TO FINISH'
                  : 'EDITING'
              );


        const header =
          document.createElement(
            'div'
          );


        header.className =
          'bar-header';


        header.innerHTML = `
          <button
            class="bar-open"
            data-bar-action="open"
          >
            <strong>BAR ${index + 1}</strong>

            <span>${status}</span>

            <small>
              ${a8ForSlots(used)} / 4 A8s
              · ${noteCount} notes
              · ${restCount} rests
            </small>
          </button>
        `;


        card.appendChild(
          header
        );


        /*
         * Only one bar is expanded.
         * Finished bars therefore become
         * compact numbered cards.
         */
        if (active) {

          const lane =
            document.createElement(
              'div'
            );


          lane.className =
            'music-lane';


          lane.dataset.barLane =
            String(
              bar.id
            );


          lane.setAttribute(
            'aria-label',
            'Bar ' +
            (
              index + 1
            ) +
            ' · 64 native A8 slots'
          );


          const timeline =
            barTimeline(
              bar
            );


          timeline.forEach(
            event => {

              const chip =
                document.createElement(
                  'button'
                );


              chip.className =
                'score-chip ' +
                (
                  event.type ===
                  'rest'
                    ? 'rest-chip'
                    : 'note-chip'
                );


              if (
                selected &&
                selected.barId ===
                  bar.id &&
                selected.eventId ===
                  event.id
              ) {
                chip.classList
                  .add(
                    'selected'
                  );
              }


              chip.dataset.eventId =
                String(
                  event.id
                );


              chip.draggable =
                true;


              chip.style.gridColumn =
                (
                  (
                    event.startSlot +
                    1
                  ) +
                  ' / span ' +
                  event.slots
                );


              if (
                event.type ===
                'rest'
              ) {
                chip.innerHTML = `
                  <span class="chip-symbol">
                    R
                  </span>

                  <small>
                    ${event.durationA8}
                  </small>
                `;
              } else {
                chip.innerHTML = `
                  <span class="chip-symbol">
                    ${scoreNoteLabel(event)}
                  </span>

                  <small>
                    ${event.durationA8}
                  </small>
                `;
              }


              chip.title =
                event.type ===
                'rest'
                  ? (
                      'REST · ' +
                      event.durationA8 +
                      ' A8s · ' +
                      event.startA8 +
                      ' → ' +
                      event.endA8
                    )
                  : (
                      scoreNoteLabel(event) +
                      ' · ' +
                      event.cyclesPerA8Second +
                      ' cycles/A8s · ' +
                      event.durationA8 +
                      ' A8s · ' +
                      event.startA8 +
                      ' → ' +
                      event.endA8
                    );


              lane.appendChild(
                chip
              );
            }
          );


          card.appendChild(
            lane
          );


          const footer =
            document.createElement(
              'div'
            );


          footer.className =
            'bar-footer';


          const selectedHere =
            !!(
              selected &&
              selected.barId ===
                bar.id &&
              bar.events.some(
                item =>
                  item.id ===
                  selected.eventId
              )
            );


          footer.innerHTML = `
            <div class="bar-meter">
              <strong>
                USED ${a8ForSlots(used)} / 4
              </strong>

              <span>
                REMAINING
                ${a8ForSlots(
                  remainingSlots(
                    bar
                  )
                )}
                A8s
              </span>
            </div>

            <div class="bar-buttons">

              <button
                data-bar-action="removeSelected"
                ${
                  selectedHere
                    ? ''
                    : 'disabled'
                }
              >
                ✕ REMOVE SELECTED
              </button>

              <button
                data-bar-action="fill"
                ${
                  remainingSlots(bar) <= 0
                    ? 'disabled'
                    : ''
                }
              >
                FILL REST
              </button>

              <button
                data-bar-action="remove-all"
                ${
                  !bar.events.length
                    ? 'disabled'
                    : ''
                }
              >
                REMOVE ALL
              </button>

              <button
                data-bar-action="delete-bar"
              >
                DELETE BAR
              </button>

              <button
                data-bar-action="move-earlier"
                ${
                  (
                    !bar.complete ||
                    bars.indexOf(bar) === 0
                  )
                    ? 'disabled'
                    : ''
                }
              >
                ◀ EARLIER
              </button>

              <button
                data-bar-action="move-later"
                ${
                  (
                    !bar.complete ||
                    bars.indexOf(bar) ===
                      bars.length - 1
                  )
                    ? 'disabled'
                    : ''
                }
              >
                LATER ▶
              </button>

              <button
                data-bar-action="repeat"
                ${
                  !bar.events.length
                    ? 'disabled'
                    : ''
                }
              >
                ⟳ REPEAT BAR
              </button>

              <button
                data-bar-action="play"
                ${
                  !bar.events.length
                    ? 'disabled'
                    : ''
                }
              >
                ▶ PLAY BAR
              </button>

              <button
                class="primary"
                data-bar-action="finish"
                ${
                  used === BAR_SLOTS
                    ? ''
                    : 'disabled'
                }
              >
                ✓ FINISH BAR
              </button>

            </div>
          `;


          card.appendChild(
            footer
          );
        }


        host.appendChild(
          card
        );
      }
    );
  }


  /*
   * The original Composer duration buttons are static DOM.
   * Populate that actual live row with additional native
   * duration controls.
   */
  function installVisibleDurationControls() {
    const inspector =
      $('inspector');

    const first =
      inspector.querySelector(
        '[data-duration]'
      );


    if (!first) {
      throw new Error(
        'LIVE DURATION ROW NOT FOUND'
      );
    }


    const host =
      first.parentElement;


    function durationButton(
      value
    ) {
      return inspector
        .querySelector(
          '[data-duration="' +
          value +
          '"]'
        );
    }


    function addDirect(
      value,
      beforeValue
    ) {
      if (
        durationButton(
          value
        )
      ) {
        return;
      }


      const button =
        document.createElement(
          'button'
        );

      button.type =
        'button';

      button.className =
        'seg-btn';

      button.dataset.duration =
        value;

      button.textContent =
        value;


      const before =
        beforeValue
          ? durationButton(
              beforeValue
            )
          : null;


      if (
        before &&
        before.parentElement ===
          host
      ) {
        host.insertBefore(
          button,
          before
        );

      } else {
        host.appendChild(
          button
        );
      }
    }


    /*
     * Familiar direct musical choices.
     */
    addDirect(
      '3/8',
      '1/2'
    );

    addDirect(
      '3/4',
      '1'
    );


    if (
      !inspector.querySelector(
        '[data-duration-adjust]'
      )
    ) {
      const separator =
        document.createElement(
          'span'
        );

      separator.textContent =
        ' ADJUST ';

      separator.style.opacity =
        '0.65';

      separator.style.margin =
        '0 0.4rem';

      host.appendChild(
        separator
      );


      const adjustments = [
        [-8, '−1/2'],
        [-4, '−1/4'],
        [-2, '−1/8'],
        [-1, '−1/16'],
        [ 1, '+1/16'],
        [ 2, '+1/8'],
        [ 4, '+1/4'],
        [ 8, '+1/2']
      ];


      adjustments.forEach(
        (
          [
            slots,
            label
          ]
        ) => {
          const button =
            document.createElement(
              'button'
            );

          button.type =
            'button';

          button.className =
            'seg-btn';

          button.dataset
            .durationAdjust =
              String(
                slots
              );

          button.textContent =
            label;

          host.appendChild(
            button
          );
        }
      );
    }
  }


  function renderInspector() {
    const found =
      selectedEvent();


    const empty =
      $('inspectorEmpty');


    const body =
      $('inspectorBody');


    if (!found) {
      empty.hidden =
        false;

      body.hidden =
        true;

      return;
    }


    empty.hidden =
      true;

    body.hidden =
      false;


    const timeline =
      barTimeline(
        found.bar
      );


    const timed =
      timeline.find(
        event =>
          event.id ===
          found.event.id
      );


    const barIndex =
      bars.findIndex(
        bar =>
          bar.id ===
          found.bar.id
      );


    $('selectedType')
      .textContent =
        found.event.type ===
        'rest'
          ? 'REST'
          : (
              found.event.noteName ||
              'NOTE'
            );


    $('selectedWhere')
      .textContent =
        (
          'BAR ' +
          (
            barIndex + 1
          ) +
          ' · ' +
          timed.startA8 +
          ' → ' +
          timed.endA8
        );


    $('selectedDuration')
      .textContent =
        (
          found.event
            .durationA8 +
          ' A8s · ' +
          timed.slots +
          (
            timed.slots === 1
              ? ' slot'
              : ' slots'
          )
        );


    document
      .querySelectorAll(
        '[data-duration]'
      )
      .forEach(
        button => {
          button.classList.toggle(
            'selected',
            button.dataset
              .duration ===
              found.event.durationA8
          );
        }
      );


    const noteOnly =
      document
        .querySelectorAll(
          '.note-only'
        );


    noteOnly.forEach(
      node => {
        node.hidden =
          found.event.type ===
          'rest';
      }
    );


    if (
      found.event.type ===
      'note'
    ) {
      $('inspectorPitch')
        .value =
          found.event
            .cyclesPerA8Second;


      $('inspectorPitchLabel')
        .textContent =
          (
            (
              found.event
                .noteName ||
              'CUSTOM'
            ) +
            (
              Number.isInteger(
                found.event
                  .octaveShift
              )
                ? (
                    ' · ' +
                    octaveText(
                      found.event
                        .octaveShift
                    )
                  )
                : ''
            )
          );


      document
        .querySelectorAll(
          '[data-wave]'
        )
        .forEach(
          button => {
            button.classList.toggle(
              'selected',
              button.dataset
                .wave ===
                found.event.waveform
            );
          }
        );


      document
        .querySelectorAll(
          '[data-motion]'
        )
        .forEach(
          button => {
            button.classList.toggle(
              'selected',
              button.dataset
                .motion ===
                found.event.motion
            );
          }
        );


      $('inspectorGain')
        .value =
          found.event.gain;


      $('gainRead')
        .textContent =
          Number(
            found.event.gain
          ).toFixed(2);
    }
  }


  function renderSongSummary() {
    const nonEmpty =
      bars.filter(
        bar =>
          bar.events.length
      );


    const complete =
      nonEmpty.filter(
        bar =>
          bar.complete &&
          usedSlots(bar) ===
          BAR_SLOTS
      );


    $('songSummary')
      .textContent =
        (
          nonEmpty.length +
          (
            nonEmpty.length === 1
              ? ' bar'
              : ' bars'
          ) +
          ' · ' +
          complete.length +
          ' complete'
        );
  }


  function render() {
    renderBars();
    renderInspector();
    renderSongSummary();
    updateJovianUI();
  }


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
      i <
        chips.length;
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


  function dragPayload(
    event
  ) {
    const text =
      event.dataTransfer
        .getData(
          'application/x-a8-score'
        ) ||
      event.dataTransfer
        .getData(
          'text/plain'
        );


    if (!text) {
      return null;
    }


    try {
      return JSON.parse(
        text
      );
    } catch (_) {
      return null;
    }
  }


  function setDragPayload(
    event,
    payload
  ) {
    const text =
      JSON.stringify(
        payload
      );


    event.dataTransfer
      .setData(
        'application/x-a8-score',
        text
      );


    event.dataTransfer
      .setData(
        'text/plain',
        text
      );


    event.dataTransfer
      .effectAllowed =
        'copyMove';
  }


  function addPaletteItem(
    payload,
    index = null
  ) {
    const bar =
      activeBar();


    if (!bar) {
      throw new Error(
        'NO OPEN BAR'
      );
    }


    const remaining =
      remainingSlots(
        bar
      );


    if (
      remaining <= 0
    ) {
      throw new Error(
        'BAR IS EXACTLY FULL'
      );
    }


    const event =
      payload.type ===
      'rest'
        ? makeRest()
        : makeNote(
            payload
          );


    /*
     * MUSICAL INSERTION RULE
     * ----------------------
     *
     * A palette event normally inherits the
     * current working duration.
     *
     * If that exact duration cannot fit into
     * the remaining native bar slots, shrink
     * ONLY the newly inserted event to the
     * exact remaining native duration.
     *
     * Example:
     *
     *   used       15/4 A8s
     *   remaining   1/4 A8s
     *
     * A dragged 1/2 note therefore becomes
     * exactly 1/4 before insertion.
     *
     * This value comes from native slot
     * arithmetic, NEVER mouse position,
     * pixels, browser time, or AudioContext.
     */

    const requestedSlots =
      slotsForDuration(
        event.durationA8
      );


    let fitted =
      false;


    if (
      requestedSlots >
      remaining
    ) {
      event.durationA8 =
        a8ForSlots(
          remaining
        );

      fitted =
        true;
    }


    insertEvent(
      bar,
      event,
      index === null
        ? bar.events.length
        : index
    );


    const identity =
      payload.type ===
      'rest'
        ? 'REST'
        : payload.noteName;


    if (fitted) {
      showMessage(
        identity +
        ' INSERTED · EXACT FIT ' +
        event.durationA8 +
        ' A8s · BAR NOW ' +
        a8ForSlots(
          usedSlots(bar)
        ) +
        ' / 4',
        true
      );

      return;
    }


    showMessage(
      payload.type ===
      'rest'
        ? 'REST INSERTED · NOW ADJUST TIME'
        : (
            payload.noteName +
            ' INSERTED · NOW ADJUST IT'
          ),
      true
    );
  }

  function moveEventWithinBar(
    bar,
    eventId,
    targetIndex
  ) {
    const sourceIndex =
      bar.events.findIndex(
        item =>
          item.id ===
          eventId
      );


    if (
      sourceIndex < 0
    ) {
      return;
    }


    const [
      item
    ] =
      bar.events.splice(
        sourceIndex,
        1
      );


    if (
      sourceIndex <
      targetIndex
    ) {
      targetIndex--;
    }


    targetIndex =
      Math.max(
        0,
        Math.min(
          targetIndex,
          bar.events.length
        )
      );


    bar.events.splice(
      targetIndex,
      0,
      item
    );


    bar.complete =
      false;


    selected = {
      barId:
        bar.id,

      eventId:
        item.id
    };


    render();
  }


  function showMessage(
    text,
    good = false
  ) {
    $('playerStatus')
      .textContent =
        text;


    $('playerStatus')
      .className =
        good
          ? 'status good'
          : 'status';
  }


  function showError(
    error
  ) {
    $('playerStatus')
      .textContent =
        error &&
        error.message
          ? error.message
          : String(error);


    $('playerStatus')
      .className =
        'status bad';
  }


  function applyPitchRatio(
    n,
    d
  ) {
    const found =
      selectedEvent();


    if (
      !found ||
      found.event.type !==
      'note'
    ) {
      return;
    }


    found.event
      .cyclesPerA8Second =
        fracText(
          mulFrac(
            found.event
              .cyclesPerA8Second,
            n,
            d
          )
        );


    /*
     * Ratio editing may no longer
     * correspond to the named legend pitch.
     */
    found.event.noteName =
      null;

    found.event.octaveShift =
      null;


    render();
  }


  function insertRestAfterSelected(
    duration
  ) {
    const found =
      selectedEvent();


    if (!found) {
      return;
    }


    const index =
      found.bar.events
        .findIndex(
          item =>
            item.id ===
            found.event.id
        );


    insertEvent(
      found.bar,
      makeRest(
        duration
      ),
      index + 1
    );


    showMessage(
      'EXPLICIT ' +
      duration +
      ' A8s REST INSERTED',
      true
    );
  }


  function jovianFrame() {
    const index =
      DURATIONS.indexOf(
        jovianBase
      );


    if (
      index < 0 ||
      index + 2 >=
        DURATIONS.length
    ) {
      throw new Error(
        'JOVIAN FRAME TOO LARGE'
      );
    }


    return {
      io:
        DURATIONS[
          index
        ],

      europa:
        DURATIONS[
          index + 1
        ],

      ganymede:
        DURATIONS[
          index + 2
        ]
    };
  }


  function updateJovianUI() {
    const frame =
      jovianFrame();


    $('jovianRead')
      .textContent =
        (
          frame.io +
          ' : ' +
          frame.europa +
          ' : ' +
          frame.ganymede
        );


    document
      .querySelectorAll(
        '[data-jovian-base]'
      )
      .forEach(
        button => {
          button.classList.toggle(
            'selected',
            button.dataset
              .jovianBase ===
              jovianBase
          );
        }
      );
  }


  function insertJovianTrio() {
    const frame =
      jovianFrame();


    const sources = [
      [
        'IO',
        frame.io
      ],

      [
        'EUROPA',
        frame.europa
      ],

      [
        'GANYMEDE',
        frame.ganymede
      ]
    ];


    const bar =
      activeBar();


    const additions =
      sources.map(
        (
          [
            name,
            duration
          ]
        ) => {
          const source =
            JOVIAN_PITCH[
              name
            ];

          const note =
            makeNote({
              ...source,

              label:
                name +
                ' · Jovian'
            });

          note.durationA8 =
            duration;

          return note;
        }
      );


    const slots =
      additions.reduce(
        (
          total,
          item
        ) =>
          total +
          slotsForDuration(
            item.durationA8
          ),
        0
      );


    if (
      usedSlots(bar) +
      slots >
      BAR_SLOTS
    ) {
      throw new Error(
        '1:2:4 TRIO WILL NOT FIT OPEN BAR'
      );
    }


    additions.forEach(
      item =>
        bar.events.push(
          item
        )
    );


    selected = {
      barId:
        bar.id,

      eventId:
        additions[
          additions.length - 1
        ].id
    };


    render();


    showMessage(
      'JOVIAN 1:2:4 TRIO INSERTED',
      true
    );
  }


  function insertJupiterWhoosh() {
    const frame =
      jovianFrame();


    const plan = [
      [
        'JUPITER',
        frame.ganymede,
        'Jupiter · anchor'
      ],

      [
        'IO',
        frame.io,
        'Io · whoosh'
      ],

      [
        'EUROPA',
        frame.europa,
        'Europa · rise'
      ],

      [
        'GANYMEDE',
        frame.ganymede,
        'Ganymede · long'
      ],

      [
        'JUPITER',
        frame.io,
        'Jupiter pulse 1'
      ],

      [
        'JUPITER',
        frame.io,
        'Jupiter pulse 2'
      ],

      [
        'JUPITER',
        frame.io,
        'Jupiter pulse 3'
      ],

      [
        'JUPITER',
        frame.io,
        'Jupiter pulse 4'
      ]
    ];


    const additions =
      plan.map(
        (
          [
            name,
            duration,
            label
          ]
        ) => {
          const source =
            JOVIAN_PITCH[
              name
            ];

          const note =
            makeNote({
              ...source,
              label
            });

          note.durationA8 =
            duration;

          return note;
        }
      );


    const bar =
      activeBar();


    const slots =
      additions.reduce(
        (
          total,
          item
        ) =>
          total +
          slotsForDuration(
            item.durationA8
          ),
        0
      );


    if (
      usedSlots(bar) +
      slots >
      BAR_SLOTS
    ) {
      throw new Error(
        'JUPITER WHOOSH WILL NOT FIT OPEN BAR AT THIS FRAME'
      );
    }


    additions.forEach(
      item =>
        bar.events.push(
          item
        )
    );


    selected = {
      barId:
        bar.id,

      eventId:
        additions[
          additions.length - 1
        ].id
    };


    render();


    showMessage(
      'JUPITER WHOOSH INSERTED',
      true
    );
  }


  function playbackEventsForBar(
    bar
  ) {
    return (
      barTimeline(
        bar
      ).map(
        event => {
          const out = {
            type:
              event.type,

            barId:
              bar.id,

            eventId:
              event.id,

            label:
              event.label,

            startA8:
              event.startA8,

            durationA8:
              event.durationA8
          };


          if (
            event.type ===
            'note'
          ) {
            Object.assign(
              out,
              {
                cyclesPerA8Second:
                  event.cyclesPerA8Second,

                waveform:
                  event.waveform,

                motion:
                  event.motion,

                gain:
                  event.gain
              }
            );
          }


          return out;
        }
      )
    );
  }


  function barPreviewScore(
    bar
  ) {
    return {
      format:
        'A8M-1',

      title:
        'Bar preview',

      pitchUnit:
        'cycles / A8 second',

      events:
        playbackEventsForBar(
          bar
        )
    };
  }


  function songPreviewScore() {
    const nonEmpty =
      bars.filter(
        bar =>
          bar.events.length
      );


    if (!nonEmpty.length) {
      throw new Error(
        'NO MUSIC TO PLAY'
      );
    }


    nonEmpty.forEach(
      bar => {
        if (
          usedSlots(bar) !==
          BAR_SLOTS
        ) {
          const index =
            bars.indexOf(
              bar
            );

          throw new Error(
            'BAR ' +
            (
              index + 1
            ) +
            ' IS NOT EXACTLY 4 A8s'
          );
        }
      }
    );


    const output =
      [];


    let barOffsetSlots =
      0;


    for (
      const bar
      of nonEmpty
    ) {
      for (
        const event
        of barTimeline(
          bar
        )
      ) {
        const out = {
          type:
            event.type,

          barId:
            bar.id,

          eventId:
            event.id,

          label:
            event.label,

          startA8:
            a8ForSlots(
              barOffsetSlots +
              event.startSlot
            ),

          durationA8:
            event.durationA8
        };


        if (
          event.type ===
          'note'
        ) {
          Object.assign(
            out,
            {
              cyclesPerA8Second:
                event.cyclesPerA8Second,

              waveform:
                event.waveform,

              motion:
                event.motion,

              gain:
                event.gain
            }
          );
        }


        output.push(
          out
        );
      }


      barOffsetSlots +=
        BAR_SLOTS;
    }


    return {
      format:
        'A8M-1',

      title:
        $('songTitle')
          .value
          .trim() ||
        'Untitled A8 composition',

      pitchUnit:
        'cycles / A8 second',

      events:
        output
    };
  }


  function saveScore() {
    return {
      format:
        'A8M-1',

      schema:
        'A8-MUSIC-DRAG-BARS-V1',

      title:
        $('songTitle')
          .value
          .trim() ||
        'Untitled A8 composition',

      barLengthA8:
        BAR_LENGTH_A8,

      nativeSubdivision:
        SLOT_A8,

      nativeSlotsPerBar:
        BAR_SLOTS,

      pitchUnit:
        'cycles / A8 second',

      timing: {
        restsExplicit:
          true,

        hiddenBrowserIntervals:
          false,

        browserDragDefinesTime:
          false,

        eventOrderDefinesPlacement:
          true,

        jovianRateRelationship:
          '1:2:4'
      },

      noteReference: {
        referenceOctave:
          'A8 0',

        exactCyclesPerA8Second:
          Object.fromEntries(
            NOTE_REFERENCE
          ),

        octaveRule:
          'exact 2:1'
      },

      bars:
        bars
          .filter(
            bar =>
              bar.events.length
          )
          .map(
            (
              bar,
              index
            ) => ({
              bar:
                index + 1,

              complete:
                usedSlots(bar) ===
                BAR_SLOTS,

              durationA8:
                a8ForSlots(
                  usedSlots(bar)
                ),

              events:
                barTimeline(
                  bar
                ).map(
                  event => {
                    const out = {
                      type:
                        event.type,

                      label:
                        event.label,

                      startA8:
                        event.startA8,

                      durationA8:
                        event.durationA8,

                      endA8:
                        event.endA8
                    };


                    if (
                      event.type ===
                      'note'
                    ) {
                      Object.assign(
                        out,
                        {
                          noteName:
                            event.noteName,

                          octaveShift:
                            event.octaveShift,

                          cyclesPerA8Second:
                            event.cyclesPerA8Second,

                          waveform:
                            event.waveform,

                          motion:
                            event.motion,

                          gain:
                            event.gain
                        }
                      );
                    }


                    return out;
                  }
                )
            }))
    };
  }


  function importScore(
    score
  ) {
    if (
      !score ||
      score.format !==
        'A8M-1' ||
      !Array.isArray(
        score.bars
      )
    ) {
      throw new Error(
        'A8M BAR SCORE REQUIRED'
      );
    }


    const imported =
      [];


    for (
      const sourceBar
      of score.bars
    ) {
      const bar =
        makeBar();


      for (
        const source
        of (
          sourceBar.events ||
          []
        )
      ) {
        if (
          source.type ===
          'rest'
        ) {
          bar.events.push({
            id:
              nextEventId++,

            type:
              'rest',

            label:
              source.label ||
              'Rest',

            durationA8:
              fracText(
                source.durationA8
              )
          });

          continue;
        }


        bar.events.push({
          id:
            nextEventId++,

          type:
            'note',

          noteName:
            source.noteName ||
            null,

          octaveShift:
            Number.isInteger(
              source.octaveShift
            )
              ? source.octaveShift
              : null,

          cyclesPerA8Second:
            fracText(
              source.cyclesPerA8Second
            ),

          durationA8:
            fracText(
              source.durationA8
            ),

          waveform:
            source.waveform ||
            'sine',

          motion:
            source.motion ||
            'steady',

          gain:
            Number(
              source.gain ??
              0.5
            ),

          label:
            source.label ||
            source.noteName ||
            'Note'
        });
      }


      if (
        usedSlots(bar) >
        BAR_SLOTS
      ) {
        throw new Error(
          'IMPORTED BAR EXCEEDS 64 NATIVE SLOTS'
        );
      }


      bar.complete =
        usedSlots(bar) ===
        BAR_SLOTS;


      imported.push(
        bar
      );
    }


    if (!imported.length) {
      imported.push(
        makeBar()
      );
    }


    if (
      imported[
        imported.length - 1
      ].complete
    ) {
      imported.push(
        makeBar()
      );
    }


    bars =
      imported;


    const firstDraft =
      bars.find(
        bar =>
          !bar.complete
      );


    activeBarId =
      (
        firstDraft ||
        bars[
          bars.length - 1
        ]
      ).id;


    selected =
      null;


    $('songTitle')
      .value =
        score.title ||
        'Imported A8 composition';


    render();
  }


  async function submitForReview() {
    const score =
      saveScore();


    if (
      score.bars.length !==
      8
    ) {
      throw new Error(
        'SUBMISSION REQUIRES EXACTLY 8 BARS · CURRENT ' +
        score.bars.length +
        ' / 8'
      );
    }


    for (
      const [
        index,
        bar
      ]
      of score.bars.entries()
    ) {
      if (
        !bar.complete ||
        bar.durationA8 !==
          '4'
      ) {
        throw new Error(
          'BAR ' +
          (
            index + 1
          ) +
          ' IS NOT EXACTLY 4 A8s'
        );
      }
    }


    const composer =
      $('submitComposer')
        .value
        .trim();


    if (!composer) {
      throw new Error(
        'COMPOSER NAME OR HANDLE REQUIRED'
      );
    }


    $('submitStatus')
      .textContent =
        'VALIDATING NATIVE SCORE…';


    $('submitStatus')
      .className =
        'status';


    const response =
      await fetch(
        '/api/music-review/submit',
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              composer,

              note:
                $('submitNote')
                  .value
                  .trim(),

              score
            })
        }
      );


    const result =
      await response.json();


    if (!response.ok) {
      throw new Error(
        result.message ||
        'SUBMISSION FAILED'
      );
    }


    $('submitStatus')
      .textContent =
        (
          'SUBMITTED · REVIEW ID ' +
          result.id +
          ' · 8 BARS · 512 NATIVE SLOTS'
        );


    $('submitStatus')
      .className =
        'status good';


    showMessage(
      'SUBMITTED FOR CURATOR REVIEW',
      true
    );
  }


  const player =
    new A8MusicPlayerV1({

      onState:
        state => {

          if (
            state.type ===
            'CORE_READY'
          ) {
            $('coreStatus')
              .textContent =
                'CORE20 CONNECTED · PREVIEW UNLOCKED';

            $('coreStatus')
              .className =
                'status good';

            $('playSong')
              .disabled =
                false;

            return;
          }


          if (
            state.type ===
            'PLAYING'
          ) {
            showMessage(
              'PLAYING · ' +
              state.eventCount +
              ' EXPLICIT A8 EVENTS',
              true
            );

            return;
          }


          if (
            state.type ===
            'POSITION'
          ) {
            $('position')
              .textContent =
                (
                  state.elapsedA8
                    .toFixed(3) +
                  ' / ' +
                  state.totalA8
                    .toFixed(3) +
                  ' A8s'
                );

            return;
          }


          if (
            state.type ===
            'COMPLETE'
          ) {
            showMessage(
              'COMPLETE'
            );

            return;
          }


          if (
            state.type ===
            'STOPPED'
          ) {
            showMessage(
              state.reason ||
              'STOPPED'
            );
          }
        },


      onEvent:
        info => {

          document
            .querySelectorAll(
              '.score-chip.playing'
            )
            .forEach(
              chip =>
                chip.classList
                  .remove(
                    'playing'
                  )
            );


          if (
            !info.event ||
            !info.event.eventId
          ) {
            return;
          }


          const chip =
            document.querySelector(
              `[data-event-id="${info.event.eventId}"]`
            );


          if (chip) {
            chip.classList
              .add(
                'playing'
              );
          }
        }

    });


  /*
   * A8 COMPOSER MOBILE PALETTE POINTER DRAG v1
   *
   * Mobile/coarse-pointer bridge only.
   *
   * Desktop HTML5 drag/drop remains authoritative
   * for mouse operation.
   *
   * This bridge changes only score ORDER / INSERTION.
   * It deliberately reuses:
   *
   *   insertionIndex()
   *   addPaletteItem()
   *
   * Pointer position NEVER defines A8 duration.
   */

  let mobilePaletteDrag =
    null;

  let mobilePaletteLane =
    null;

  let mobilePaletteSuppressClick =
    false;


  function mobilePalettePayload(
    source
  ) {
    if (
      !source ||
      !source.dataset
    ) {
      return null;
    }


    if (
      source.dataset
        .paletteType ===
      'rest'
    ) {
      return {
        kind:
          'palette',

        type:
          'rest'
      };
    }


    if (
      source.dataset
        .paletteType !==
      'note'
    ) {
      return null;
    }


    return {
      kind:
        'palette',

      type:
        'note',

      noteName:
        source.dataset
          .noteName,

      octaveShift:
        Number(
          source.dataset
            .octaveShift
        ),

      pitch:
        source.dataset
          .pitch
    };
  }


  function mobilePaletteLaneAt(
    clientX,
    clientY
  ) {
    const target =
      document.elementFromPoint(
        clientX,
        clientY
      );


    if (!target) {
      return null;
    }


    return target.closest(
      '.music-lane'
    );
  }


  function clearMobilePaletteLane() {
    if (!mobilePaletteLane) {
      return;
    }


    mobilePaletteLane
      .classList
      .remove(
        'drag-over'
      );


    mobilePaletteLane =
      null;
  }


  function clearMobilePaletteDrag() {
    clearMobilePaletteLane();


    if (
      mobilePaletteDrag &&
      mobilePaletteDrag.source
    ) {
      mobilePaletteDrag
        .source
        .classList
        .remove(
          'a8-touch-drag-source'
        );


      try {
        if (
          mobilePaletteDrag
            .source
            .hasPointerCapture &&
          mobilePaletteDrag
            .source
            .hasPointerCapture(
              mobilePaletteDrag
                .pointerId
            )
        ) {
          mobilePaletteDrag
            .source
            .releasePointerCapture(
              mobilePaletteDrag
                .pointerId
            );
        }
      } catch (_) {}
    }


    document.body
      .classList
      .remove(
        'a8-composer-touch-dragging'
      );


    mobilePaletteDrag =
      null;
  }


  $('notePalette')
    .addEventListener(
      'pointerdown',
      event => {

        /*
         * Mouse keeps the proven HTML5
         * drag/drop path.
         */
        if (
          event.pointerType ===
          'mouse'
        ) {
          return;
        }


        if (
          event.isPrimary ===
          false
        ) {
          return;
        }


        const source =
          event.target.closest(
            '[data-palette-type]'
          );


        if (!source) {
          return;
        }


        const payload =
          mobilePalettePayload(
            source
          );


        if (!payload) {
          return;
        }


        mobilePaletteDrag = {
          pointerId:
            event.pointerId,

          source,

          payload,

          startX:
            event.clientX,

          startY:
            event.clientY,

          dragging:
            false
        };


        try {
          source.setPointerCapture(
            event.pointerId
          );
        } catch (_) {}
      }
    );


  window.addEventListener(
    'pointermove',
    event => {

      if (
        !mobilePaletteDrag ||
        event.pointerId !==
          mobilePaletteDrag
            .pointerId
      ) {
        return;
      }


      const dx =
        event.clientX -
        mobilePaletteDrag
          .startX;

      const dy =
        event.clientY -
        mobilePaletteDrag
          .startY;


      /*
       * Tiny movement does not yet count
       * as a drag.
       */
      if (
        !mobilePaletteDrag
          .dragging &&
        Math.hypot(
          dx,
          dy
        ) < 7
      ) {
        return;
      }


      if (
        !mobilePaletteDrag
          .dragging
      ) {
        mobilePaletteDrag
          .dragging =
            true;


        mobilePaletteDrag
          .source
          .classList
          .add(
            'a8-touch-drag-source'
          );


        document.body
          .classList
          .add(
            'a8-composer-touch-dragging'
          );
      }


      /*
       * Once the note is actually moving,
       * this is score dragging, not page scroll.
       */
      event.preventDefault();


      const lane =
        mobilePaletteLaneAt(
          event.clientX,
          event.clientY
        );


      if (
        lane ===
        mobilePaletteLane
      ) {
        return;
      }


      clearMobilePaletteLane();


      if (lane) {
        mobilePaletteLane =
          lane;


        lane.classList
          .add(
            'drag-over'
          );
      }
    },
    {
      passive:
        false
    }
  );


  window.addEventListener(
    'pointerup',
    event => {

      if (
        !mobilePaletteDrag ||
        event.pointerId !==
          mobilePaletteDrag
            .pointerId
      ) {
        return;
      }


      const state =
        mobilePaletteDrag;


      const lane =
        mobilePaletteLaneAt(
          event.clientX,
          event.clientY
        );


      const wasDragging =
        state.dragging;


      clearMobilePaletteDrag();


      if (!wasDragging) {
        return;
      }


      event.preventDefault();


      /*
       * Some mobile browsers emit a click
       * immediately after touch drag.
       */
      mobilePaletteSuppressClick =
        true;


      window.setTimeout(
        () => {
          mobilePaletteSuppressClick =
            false;
        },
        350
      );


      /*
       * Release outside a bar means:
       * do nothing.
       */
      if (!lane) {
        return;
      }


      const bar =
        barById(
          Number(
            lane.dataset
              .barLane
          )
        );


      if (!bar) {
        return;
      }


      const index =
        insertionIndex(
          lane,
          event.clientX
        );


      try {
        /*
         * SAME score insertion path
         * used by desktop DROP.
         */
        activeBarId =
          bar.id;


        addPaletteItem(
          state.payload,
          index
        );

      } catch (error) {
        showError(
          error
        );
      }
    },
    {
      passive:
        false
    }
  );


  window.addEventListener(
    'pointercancel',
    event => {

      if (
        !mobilePaletteDrag ||
        event.pointerId !==
          mobilePaletteDrag
            .pointerId
      ) {
        return;
      }


      clearMobilePaletteDrag();
    }
  );


  $('notePalette')
    .addEventListener(
      'click',
      event => {

        if (
          !mobilePaletteSuppressClick
        ) {
          return;
        }


        if (
          !event.target.closest(
            '[data-palette-type]'
          )
        ) {
          return;
        }


        event.preventDefault();
        event.stopPropagation();
      },
      true
    );


  /*
   * PALETTE DRAG
   */
  $('notePalette')
    .addEventListener(
      'dragstart',
      event => {

        const source =
          event.target.closest(
            '[data-palette-type]'
          );


        if (!source) {
          return;
        }


        if (
          source.dataset
            .paletteType ===
          'rest'
        ) {
          setDragPayload(
            event,
            {
              kind:
                'palette',

              type:
                'rest'
            }
          );

          return;
        }


        setDragPayload(
          event,
          {
            kind:
              'palette',

            type:
              'note',

            noteName:
              source.dataset
                .noteName,

            octaveShift:
              Number(
                source.dataset
                  .octaveShift
              ),

            pitch:
              source.dataset
                .pitch
          }
        );
      }
    );


  /*
   * Click is a desktop/mobile fallback:
   * append to currently open bar.
   */
  $('notePalette')
    .addEventListener(
      'click',
      event => {

        const source =
          event.target.closest(
            '[data-palette-type]'
          );


        if (!source) {
          return;
        }


        try {

          if (
            source.dataset
              .paletteType ===
            'rest'
          ) {
            addPaletteItem({
              type:
                'rest'
            });

            return;
          }


          addPaletteItem({
            type:
              'note',

            noteName:
              source.dataset
                .noteName,

            octaveShift:
              Number(
                source.dataset
                  .octaveShift
              ),

            pitch:
              source.dataset
                .pitch
          });

        } catch (error) {
          showError(
            error
          );
        }
      }
    );


  /*
   * SCORE BAR EVENTS
   */
  $('bars')
    .addEventListener(
      'click',
      event => {

        const card =
          event.target.closest(
            '.bar-card'
          );


        if (!card) {
          return;
        }


        const bar =
          barById(
            Number(
              card.dataset
                .barId
            )
          );


        if (!bar) {
          return;
        }


        const action =
          event.target.closest(
            '[data-bar-action]'
          );


        if (action) {
          try {

            if (
              action.dataset
                .barAction ===
              'open'
            ) {
              activeBarId =
                bar.id;

              selected =
                null;

              render();

              return;
            }


            if (
              action.dataset
                .barAction ===
              'removeSelected'
            ) {
              if (
                !selected ||
                selected.barId !==
                  bar.id
              ) {
                throw new Error(
                  'SELECT A NOTE OR REST FIRST'
                );
              }

              deleteSelected();

              showMessage(
                'EVENT REMOVED',
                true
              );

              return;
            }


            if (
              action.dataset
                .barAction ===
              'fill'
            ) {
              fillBarWithRest(
                bar
              );

              return;
            }


            if (
              action.dataset
                .barAction ===
              'finish'
            ) {
              finishBar(
                bar
              );

              return;
            }


            if (
              action.dataset
                .barAction ===
              'remove-all'
            ) {
              clearBar(
                bar
              );

              return;
            }


            if (
              action.dataset
                .barAction ===
              'delete-bar'
            ) {
              deleteBar(
                bar
              );

              return;
            }


            if (
              action.dataset
                .barAction ===
              'move-earlier'
            ) {
              moveBar(
                bar,
                -1
              );

              return;
            }


            if (
              action.dataset
                .barAction ===
              'move-later'
            ) {
              moveBar(
                bar,
                1
              );

              return;
            }


            if (
              action.dataset
                .barAction ===
              'repeat'
            ) {
              repeatBar(
                bar
              );

              return;
            }


            if (
              action.dataset
                .barAction ===
              'play'
            ) {
              player
                .play(
                  barPreviewScore(
                    bar
                  )
                )
                .catch(
                  showError
                );

              return;
            }

          } catch (error) {
            showError(
              error
            );

            return;
          }
        }


        const chip =
          event.target.closest(
            '.score-chip'
          );


        if (chip) {
          selectEvent(
            bar.id,
            Number(
              chip.dataset
                .eventId
            )
          );
        }
      }
    );



  /*
   * A8 COMPOSER MOBILE EXISTING SCORE REORDER v1
   *
   * Touch / pen bridge for rearranging an EXISTING
   * note or rest inside its current A8 score bar.
   *
   * Mouse keeps the proven HTML5 drag/drop path.
   *
   * This bridge does NOT define duration or timing.
   * It deliberately reuses the existing:
   *
   *   insertionIndex()
   *   moveEventWithinBar()
   *
   * Same-bar movement only, matching desktop behavior.
   */

  let mobileScoreDrag =
    null;

  let mobileScoreLane =
    null;

  let mobileScoreSuppressClick =
    false;


  function mobileScoreLaneAt(
    clientX,
    clientY
  ) {
    const target =
      document.elementFromPoint(
        clientX,
        clientY
      );


    if (!target) {
      return null;
    }


    return target.closest(
      '.music-lane'
    );
  }


  function clearMobileScoreLane() {
    if (!mobileScoreLane) {
      return;
    }


    mobileScoreLane
      .classList
      .remove(
        'drag-over'
      );


    mobileScoreLane =
      null;
  }


  function clearMobileScoreDrag() {
    clearMobileScoreLane();


    if (
      mobileScoreDrag &&
      mobileScoreDrag.source
    ) {
      mobileScoreDrag
        .source
        .classList
        .remove(
          'a8-touch-score-drag-source'
        );


      try {
        if (
          mobileScoreDrag
            .source
            .hasPointerCapture &&
          mobileScoreDrag
            .source
            .hasPointerCapture(
              mobileScoreDrag
                .pointerId
            )
        ) {
          mobileScoreDrag
            .source
            .releasePointerCapture(
              mobileScoreDrag
                .pointerId
            );
        }
      } catch (_) {}
    }


    document.body
      .classList
      .remove(
        'a8-composer-score-touch-dragging'
      );


    mobileScoreDrag =
      null;
  }


  $('bars')
    .addEventListener(
      'pointerdown',
      event => {

        /*
         * Mouse keeps native HTML5 drag/drop.
         */
        if (
          event.pointerType ===
          'mouse'
        ) {
          return;
        }


        if (
          event.isPrimary ===
          false
        ) {
          return;
        }


        const chip =
          event.target.closest(
            '.score-chip'
          );


        if (!chip) {
          return;
        }


        const card =
          chip.closest(
            '.bar-card'
          );

        const lane =
          chip.closest(
            '.music-lane'
          );


        if (
          !card ||
          !lane
        ) {
          return;
        }


        const barId =
          Number(
            card.dataset
              .barId
          );

        const eventId =
          Number(
            chip.dataset
              .eventId
          );


        if (
          !Number.isInteger(
            barId
          ) ||
          !Number.isInteger(
            eventId
          )
        ) {
          return;
        }


        mobileScoreDrag = {
          pointerId:
            event.pointerId,

          source:
            chip,

          barId,

          eventId,

          startX:
            event.clientX,

          startY:
            event.clientY,

          dragging:
            false
        };


        try {
          chip.setPointerCapture(
            event.pointerId
          );
        } catch (_) {}
      }
    );


  window.addEventListener(
    'pointermove',
    event => {

      if (
        !mobileScoreDrag ||
        event.pointerId !==
          mobileScoreDrag
            .pointerId
      ) {
        return;
      }


      const dx =
        event.clientX -
        mobileScoreDrag
          .startX;

      const dy =
        event.clientY -
        mobileScoreDrag
          .startY;


      /*
       * Preserve normal tap/select behavior.
       */
      if (
        !mobileScoreDrag
          .dragging &&
        Math.hypot(
          dx,
          dy
        ) < 7
      ) {
        return;
      }


      if (
        !mobileScoreDrag
          .dragging
      ) {
        mobileScoreDrag
          .dragging =
            true;


        mobileScoreDrag
          .source
          .classList
          .add(
            'a8-touch-score-drag-source'
          );


        document.body
          .classList
          .add(
            'a8-composer-score-touch-dragging'
          );
      }


      event.preventDefault();


      let lane =
        mobileScoreLaneAt(
          event.clientX,
          event.clientY
        );


      /*
       * Existing-event reorder remains
       * strictly inside its source bar.
       */
      if (
        lane &&
        Number(
          lane.dataset
            .barLane
        ) !==
          mobileScoreDrag.barId
      ) {
        lane =
          null;
      }


      if (
        lane ===
        mobileScoreLane
      ) {
        return;
      }


      clearMobileScoreLane();


      if (lane) {
        mobileScoreLane =
          lane;


        lane.classList
          .add(
            'drag-over'
          );
      }
    },
    {
      passive:
        false
    }
  );


  window.addEventListener(
    'pointerup',
    event => {

      if (
        !mobileScoreDrag ||
        event.pointerId !==
          mobileScoreDrag
            .pointerId
      ) {
        return;
      }


      const state =
        mobileScoreDrag;


      let lane =
        mobileScoreLaneAt(
          event.clientX,
          event.clientY
        );


      if (
        lane &&
        Number(
          lane.dataset
            .barLane
        ) !==
          state.barId
      ) {
        lane =
          null;
      }


      const wasDragging =
        state.dragging;


      clearMobileScoreDrag();


      if (!wasDragging) {
        return;
      }


      event.preventDefault();


      /*
       * Kill the synthetic click some mobile
       * browsers emit after a finger drag.
       */
      mobileScoreSuppressClick =
        true;


      window.setTimeout(
        () => {
          mobileScoreSuppressClick =
            false;
        },
        350
      );


      /*
       * Release outside the source bar:
       * leave score unchanged.
       */
      if (!lane) {
        return;
      }


      const bar =
        barById(
          state.barId
        );


      if (!bar) {
        return;
      }


      const index =
        insertionIndex(
          lane,
          event.clientX
        );


      try {
        /*
         * SAME score reorder function
         * used by desktop DROP.
         */
        moveEventWithinBar(
          bar,
          state.eventId,
          index
        );

      } catch (error) {
        showError(
          error
        );
      }
    },
    {
      passive:
        false
    }
  );


  window.addEventListener(
    'pointercancel',
    event => {

      if (
        !mobileScoreDrag ||
        event.pointerId !==
          mobileScoreDrag
            .pointerId
      ) {
        return;
      }


      clearMobileScoreDrag();
    }
  );


  /*
   * Suppress only the post-drag synthetic click.
   * Ordinary phone taps still select score events.
   */
  $('bars')
    .addEventListener(
      'click',
      event => {

        if (
          !mobileScoreSuppressClick
        ) {
          return;
        }


        event.preventDefault();
        event.stopPropagation();
      },
      true
    );


  $('bars')
    .addEventListener(
      'dragstart',
      event => {

        const chip =
          event.target.closest(
            '.score-chip'
          );


        if (!chip) {
          return;
        }


        const card =
          chip.closest(
            '.bar-card'
          );


        setDragPayload(
          event,
          {
            kind:
              'existing',

            barId:
              Number(
                card.dataset
                  .barId
              ),

            eventId:
              Number(
                chip.dataset
                  .eventId
              )
          }
        );
      }
    );


  $('bars')
    .addEventListener(
      'dragover',
      event => {

        const lane =
          event.target.closest(
            '.music-lane'
          );


        if (!lane) {
          return;
        }


        event.preventDefault();


        lane.classList
          .add(
            'drag-over'
          );
      }
    );


  $('bars')
    .addEventListener(
      'dragleave',
      event => {

        const lane =
          event.target.closest(
            '.music-lane'
          );


        if (lane) {
          lane.classList
            .remove(
              'drag-over'
            );
        }
      }
    );


  $('bars')
    .addEventListener(
      'drop',
      event => {

        const lane =
          event.target.closest(
            '.music-lane'
          );


        if (!lane) {
          return;
        }


        event.preventDefault();


        lane.classList
          .remove(
            'drag-over'
          );


        const payload =
          dragPayload(
            event
          );


        if (!payload) {
          return;
        }


        const bar =
          barById(
            Number(
              lane.dataset
                .barLane
            )
          );


        if (!bar) {
          return;
        }


        const index =
          insertionIndex(
            lane,
            event.clientX
          );


        try {

          if (
            payload.kind ===
            'palette'
          ) {
            activeBarId =
              bar.id;

            addPaletteItem(
              payload,
              index
            );

            return;
          }


          if (
            payload.kind ===
              'existing' &&
            payload.barId ===
              bar.id
          ) {
            moveEventWithinBar(
              bar,
              payload.eventId,
              index
            );
          }

        } catch (error) {
          showError(
            error
          );
        }
      }
    );


  /*
   * SINGLE INSPECTOR
   */
  $('inspector')
    .addEventListener(
      'click',
      event => {

        const found =
          selectedEvent();


        if (!found) {
          return;
        }


        try {

          const duration =
            event.target.closest(
              '[data-duration]'
            );


          if (duration) {
            setSelectedDuration(
              duration.dataset
                .duration
            );

            return;
          }


          const wave =
            event.target.closest(
              '[data-wave]'
            );


          if (
            wave &&
            found.event.type ===
              'note'
          ) {
            found.event.waveform =
              wave.dataset.wave;

            insertDefaults.waveform =
              found.event.waveform;

            render();

            return;
          }


          const motion =
            event.target.closest(
              '[data-motion]'
            );


          if (
            motion &&
            found.event.type ===
              'note'
          ) {
            found.event.motion =
              motion.dataset.motion;

            insertDefaults.motion =
              found.event.motion;

            render();

            return;
          }


          const ratio =
            event.target.closest(
              '[data-pitch-ratio]'
            );


          if (
            ratio &&
            found.event.type ===
              'note'
          ) {
            const [
              n,
              d
            ] =
              ratio.dataset
                .pitchRatio
                .split('/')
                .map(Number);


            applyPitchRatio(
              n,
              d
            );

            return;
          }


          const restAfter =
            event.target.closest(
              '[data-rest-after]'
            );


          if (restAfter) {
            insertRestAfterSelected(
              restAfter.dataset
                .restAfter
            );

            return;
          }


          if (
            event.target.closest(
              '#deleteSelected'
            )
          ) {
            deleteSelected();

            showMessage(
              'EVENT REMOVED',
              true
            );

            return;
          }

        } catch (error) {
          showError(
            error
          );
        }
      }
    );


  $('inspectorPitch')
    .addEventListener(
      'change',
      () => {

        const found =
          selectedEvent();


        if (
          !found ||
          found.event.type !==
            'note'
        ) {
          return;
        }


        try {
          found.event
            .cyclesPerA8Second =
              fracText(
                $('inspectorPitch')
                  .value
              );


          found.event.noteName =
            null;

          found.event.octaveShift =
            null;


          render();

        } catch (error) {
          showError(
            error
          );

          renderInspector();
        }
      }
    );


  $('inspectorGain')
    .addEventListener(
      'input',
      () => {

        const found =
          selectedEvent();


        if (
          !found ||
          found.event.type !==
            'note'
        ) {
          return;
        }


        found.event.gain =
          Number(
            $('inspectorGain')
              .value
          );


        insertDefaults.gain =
          found.event.gain;


        $('gainRead')
          .textContent =
            found.event.gain
              .toFixed(2);
      }
    );


  /*
   * JOVIAN QUICK TOYS
   */
  $('jovianControls')
    .addEventListener(
      'click',
      event => {

        try {

          const base =
            event.target.closest(
              '[data-jovian-base]'
            );


          if (base) {
            jovianBase =
              base.dataset
                .jovianBase;

            updateJovianUI();

            return;
          }


          if (
            event.target.id ===
            'insertTrio'
          ) {
            insertJovianTrio();

            return;
          }


          if (
            event.target.id ===
            'insertWhoosh'
          ) {
            insertJupiterWhoosh();

            return;
          }

        } catch (error) {
          showError(
            error
          );
        }
      }
    );


  /*
   * CURATED REVIEW SUBMISSION
   *
   * Browser provides only ordinary form transport.
   * Native score content is revalidated server-side.
   */
  $('submitReview')
    .addEventListener(
      'click',
      async () => {

        try {
          await submitForReview();

        } catch (error) {
          $('submitStatus')
            .textContent =
              error.message ||
              String(error);

          $('submitStatus')
            .className =
              'status bad';

          showError(
            error
          );
        }
      }
    );


  /*
   * PLAYER / FILE
   */
  $('connectCore')
    .addEventListener(
      'click',
      async () => {

        $('coreStatus')
          .textContent =
            'CONNECTING…';


        try {
          await player
            .connectCore();
        } catch (error) {
          $('coreStatus')
            .textContent =
              'CORE20 CONNECTION FAILED';

          $('coreStatus')
            .className =
              'status bad';

          showError(
            error
          );
        }
      }
    );


  $('playSong')
    .addEventListener(
      'click',
      () => {

        try {
          player
            .play(
              songPreviewScore()
            )
            .catch(
              showError
            );
        } catch (error) {
          showError(
            error
          );
        }
      }
    );


  $('stop')
    .addEventListener(
      'click',
      () => {
        player.stop(
          'STOPPED BY USER'
        );
      }
    );


  $('save')
    .addEventListener(
      'click',
      () => {

        try {
          const score =
            saveScore();


          const blob =
            new Blob(
              [
                JSON.stringify(
                  score,
                  null,
                  2
                ) +
                '\n'
              ],
              {
                /*
                 * A8M is JSON-encoded score data,
                 * but the downloaded artifact is
                 * an A8M composition.
                 *
                 * Do not advertise it as .json or
                 * browsers may append that suffix.
                 */
                type:
                  'application/octet-stream'
              }
            );


          const url =
            URL.createObjectURL(
              blob
            );


          const a =
            document.createElement(
              'a'
            );


          const safe =
            (
              score.title ||
              'a8-composition'
            )
              .toLowerCase()
              .replace(
                /[^a-z0-9]+/g,
                '-'
              )
              .replace(
                /^-|-$/g,
                ''
              ) ||
            'a8-composition';


          a.href =
            url;


          a.download =
            safe +
            '.a8m';


          a.click();


          setTimeout(
            () =>
              URL.revokeObjectURL(
                url
              ),
            1000
          );


          showMessage(
            'A8M SAVED',
            true
          );

        } catch (error) {
          showError(
            error
          );
        }
      }
    );


  $('open')
    .addEventListener(
      'click',
      () => {
        $('file')
          .click();
      }
    );


  $('file')
    .addEventListener(
      'change',
      async event => {

        const file =
          event.target.files &&
          event.target.files[0];


        if (!file) {
          return;
        }


        try {
          importScore(
            JSON.parse(
              await file.text()
            )
          );


          showMessage(
            'OPENED · ' +
            file.name,
            true
          );

        } catch (error) {
          showError(
            error
          );
        }


        event.target.value =
          '';
      }
    );


  /*
   * UI ORDER ONLY.
   *
   * Put the actual composition bar directly
   * beneath the draggable note/rest palette,
   * then keep the one shared inspector beneath
   * the score.
   *
   * This DOM movement has no relationship to
   * A8 score timing or playback authority.
   */
  const palettePanel =
    $('palettePanel');

  const scorePanel =
    $('scorePanel');

  const inspectorPanel =
    $('inspector');


  if (
    palettePanel &&
    scorePanel &&
    inspectorPanel
  ) {
    palettePanel
      .insertAdjacentElement(
        'afterend',
        scorePanel
      );

    scorePanel
      .insertAdjacentElement(
        'afterend',
        inspectorPanel
      );
  }


  /*
   * Independent native duration adjustment listener.
   *
   * Original inspector listener remains untouched.
   */
  $('inspector')
    .addEventListener(
      'click',
      event => {
        const adjustment =
          event.target.closest(
            '[data-duration-adjust]'
          );


        if (!adjustment) {
          return;
        }


        try {
          adjustSelectedDuration(
            Number(
              adjustment.dataset
                .durationAdjust
            )
          );

        } catch (error) {
          showError(
            error
          );
        }
      }
    );



  /* A8-RIPPLE-FABRIC-V1-BEGIN */

  /*
   * RIPPLE FABRIC V1
   * ================
   *
   * Bars remain exact 64-slot visual / score
   * containers.
   *
   * Editing acts on one continuous ordered
   * logical event stream:
   *
   * logical events
   *      ↓
   * exact native durations
   *      ↓
   * continuous reflow
   *      ↓
   * exact 64-slot bars
   *      ↓
   * explicit note ties at barlines
   *
   * Browser pixels and browser time never
   * participate in score timing.
   */

  let a8RippleSerial =
    1;


  const a8RippleKeyByEventId =
    new Map();


  let a8RippleAnchorKey =
    null;


  let a8RippleRangeKeys =
    [];


  let a8RippleClipboard =
    [];


  function a8RippleNewKey() {
    return (
      'RIPPLE-' +
      a8RippleSerial++
    );
  }


  function a8RippleStripTie(
    event
  ) {
    const out = {
      ...event
    };


    delete out.tieId;
    delete out.tiePrev;
    delete out.tieNext;


    return out;
  }


  function a8RippleEventKey(
    event
  ) {
    const mapped =
      a8RippleKeyByEventId
        .get(
          event.id
        );


    if (mapped) {
      return mapped;
    }


    /*
     * Existing explicit tied pieces already
     * describe one logical note.
     */
    const key =
      (
        event.type ===
          'note' &&
        event.tieId
      )
        ? (
            'TIE:' +
            String(
              event.tieId
            )
          )
        : a8RippleNewKey();


    a8RippleKeyByEventId
      .set(
        event.id,
        key
      );


    return key;
  }


  /*
   * Convert current bar-local physical pieces
   * into one ordered logical musical sequence.
   *
   * Existing explicit tied note pieces merge
   * back into one logical note.
   *
   * Pieces generated by this ripple layer also
   * merge through a8RippleKeyByEventId, which
   * permits rests crossing barlines to remain
   * one editable logical rest during the live
   * editing session.
   */
  function a8RippleSequence() {
    const sequence =
      [];


    const byKey =
      new Map();


    bars.forEach(
      bar => {
        bar.events.forEach(
          event => {
            const key =
              a8RippleEventKey(
                event
              );


            const slots =
              slotsForDuration(
                event.durationA8
              );


            let logical =
              byKey.get(
                key
              );


            if (!logical) {
              const base =
                a8RippleStripTie(
                  event
                );


              logical = {
                key,

                event:
                  base,

                slots:
                  0,

                preferredTieId:
                  (
                    event.type ===
                      'note' &&
                    event.tieId
                  )
                    ? String(
                        event.tieId
                      )
                    : null
              };


              sequence.push(
                logical
              );


              byKey.set(
                key,
                logical
              );
            }


            logical.slots +=
              slots;
          }
        );
      }
    );


    sequence.forEach(
      logical => {
        logical.event
          .durationA8 =
            a8ForSlots(
              logical.slots
            );
      }
    );


    return sequence;
  }


  function a8RippleSelectedKey(
    sequence =
      null
  ) {
    const found =
      selectedEvent();


    if (!found) {
      return null;
    }


    /*
     * Calling a8RippleSequence populates the
     * event-id → logical-key map for imported
     * or pre-ripple events.
     */
    if (!sequence) {
      sequence =
        a8RippleSequence();
    }


    return (
      a8RippleKeyByEventId
        .get(
          found.event.id
        ) ||
      null
    );
  }


  function a8RippleLogicalByKey(
    sequence,
    key
  ) {
    return (
      sequence.find(
        logical =>
          logical.key ===
            key
      ) ||
      null
    );
  }


  function a8RippleEnsureBars(
    count
  ) {
    while (
      bars.length <
        count
    ) {
      bars.push(
        makeBar()
      );
    }


    if (!bars.length) {
      bars.push(
        makeBar()
      );
    }
  }


  /*
   * Re-project the entire logical score through
   * exact 64-slot bar windows.
   *
   * Existing bar objects are retained where
   * possible so the visible BAR 1 / BAR 2 / ...
   * framework remains stable.
   *
   * Additional bars are created automatically
   * when the musical sequence grows.
   *
   * Trailing existing bars are intentionally
   * retained as empty working bars when the
   * sequence shrinks.
   */
  function a8RippleReflow(
    sequence,
    selectKey =
      null
  ) {
    const totalSlots =
      sequence.reduce(
        (
          total,
          logical
        ) =>
          total +
          logical.slots,
        0
      );


    const requiredBars =
      Math.max(
        1,
        Math.ceil(
          totalSlots /
          BAR_SLOTS
        )
      );


    a8RippleEnsureBars(
      requiredBars
    );


    bars.forEach(
      bar => {
        bar.events =
          [];

        bar.complete =
          false;
      }
    );


    a8RippleKeyByEventId
      .clear();


    let cursor =
      0;


    let selectedLocation =
      null;


    sequence.forEach(
      logical => {
        if (
          logical.slots <=
            0
        ) {
          throw new Error(
            'RIPPLE EVENT MUST HAVE POSITIVE DURATION'
          );
        }


        let remaining =
          logical.slots;


        let firstPiece =
          true;


        const pieces =
          [];


        while (
          remaining >
            0
        ) {
          const barIndex =
            Math.floor(
              cursor /
              BAR_SLOTS
            );


          a8RippleEnsureBars(
            barIndex + 1
          );


          const slotInBar =
            cursor %
            BAR_SLOTS;


          const room =
            BAR_SLOTS -
            slotInBar;


          const take =
            Math.min(
              remaining,
              room
            );


          const piece =
            a8RippleStripTie({
              ...logical.event,

              id:
                firstPiece
                  ? logical.event.id
                  : nextEventId++,

              durationA8:
                a8ForSlots(
                  take
                )
            });


          pieces.push({
            barIndex,
            event:
              piece
          });


          cursor +=
            take;


          remaining -=
            take;


          firstPiece =
            false;
        }


        /*
         * One logical note may occupy any number
         * of physical bar pieces.
         *
         * Every piece receives one common explicit
         * tie identity.
         */
        if (
          logical.event.type ===
            'note' &&
          pieces.length >
            1
        ) {
          const tieId =
            logical.preferredTieId ||
            makeAutoTieId();


          pieces.forEach(
            (
              piece,
              index
            ) => {
              piece.event.tieId =
                tieId;

              piece.event.tiePrev =
                index >
                0;

              piece.event.tieNext =
                index <
                pieces.length -
                  1;
            }
          );
        }


        pieces.forEach(
          piece => {
            const bar =
              bars[
                piece.barIndex
              ];


            bar.events.push(
              piece.event
            );


            a8RippleKeyByEventId
              .set(
                piece.event.id,
                logical.key
              );


            if (
              selectKey &&
              logical.key ===
                selectKey &&
              !selectedLocation
            ) {
              selectedLocation = {
                barId:
                  bar.id,

                eventId:
                  piece.event.id
              };
            }
          }
        );
      }
    );


    bars.forEach(
      bar => {
        bar.complete =
          (
            usedSlots(
              bar
            ) ===
            BAR_SLOTS
          );
      }
    );


    if (
      selectedLocation
    ) {
      selected =
        selectedLocation;

      activeBarId =
        selectedLocation.barId;

    } else if (
      !barById(
        activeBarId
      )
    ) {
      activeBarId =
        bars[0].id;

      selected =
        null;
    }


    render();
  }


  /*
   * RIPPLE DURATION EDIT
   * --------------------
   *
   * Desired duration applies to the selected
   * LOGICAL event, not merely one physical tie
   * fragment.
   *
   * Reflow automatically pushes or pulls every
   * later event through all subsequent bars.
   */
  setSelectedDuration =
    function (
      duration
    ) {
      const found =
        selectedEvent();


      if (!found) {
        return;
      }


      const sequence =
        a8RippleSequence();


      const key =
        a8RippleSelectedKey(
          sequence
        );


      const logical =
        a8RippleLogicalByKey(
          sequence,
          key
        );


      if (!logical) {
        throw new Error(
          'SELECTED LOGICAL EVENT NOT FOUND'
        );
      }


      const requested =
        fracText(
          duration
        );


      const requestedSlots =
        slotsForDuration(
          requested
        );


      if (
        requestedSlots <=
          0
      ) {
        throw new Error(
          'DURATION MUST BE POSITIVE'
        );
      }


      logical.slots =
        requestedSlots;


      logical.event
        .durationA8 =
          requested;


      insertDefaults
        .durationA8 =
          requested;


      a8RippleRangeKeys =
        [
          key
        ];


      a8RippleAnchorKey =
        key;


      a8RippleReflow(
        sequence,
        key
      );


      showMessage(
        requested +
        ' A8s · RIPPLE REFLOW',
        true
      );
    };


  adjustSelectedDuration =
    function (
      deltaSlots
    ) {
      const found =
        selectedEvent();


      if (!found) {
        return;
      }


      const sequence =
        a8RippleSequence();


      const key =
        a8RippleSelectedKey(
          sequence
        );


      const logical =
        a8RippleLogicalByKey(
          sequence,
          key
        );


      if (!logical) {
        throw new Error(
          'SELECTED LOGICAL EVENT NOT FOUND'
        );
      }


      const nextSlots =
        logical.slots +
        Number(
          deltaSlots
        );


      if (
        nextSlots <=
          0
      ) {
        throw new Error(
          'DURATION MUST REMAIN AT LEAST 1/16 A8s'
        );
      }


      /*
       * Preserve the existing Composer single-event
       * maximum of one full 4-A8-second bar.
       *
       * The event may START anywhere and therefore
       * may still cross a barline. The surrounding
       * sequence can ripple across arbitrarily many
       * bars.
       */
      if (
        nextSlots >
          BAR_SLOTS
      ) {
        throw new Error(
          'MAXIMUM SINGLE EVENT DURATION IS 4 A8s'
        );
      }


      setSelectedDuration(
        a8ForSlots(
          nextSlots
        )
      );
    };


  function a8RippleCurrentRange(
    sequence
  ) {
    if (
      a8RippleRangeKeys.length
    ) {
      const wanted =
        new Set(
          a8RippleRangeKeys
        );


      return (
        sequence.filter(
          logical =>
            wanted.has(
              logical.key
            )
        )
      );
    }


    const key =
      a8RippleSelectedKey(
        sequence
      );


    const logical =
      a8RippleLogicalByKey(
        sequence,
        key
      );


    return (
      logical
        ? [logical]
        : []
    );
  }


  /*
   * DELETE now means structural collapse.
   *
   * No implicit REST is inserted.
   */
  deleteSelected =
    function () {
      const sequence =
        a8RippleSequence();


      const selectedKey =
        a8RippleSelectedKey(
          sequence
        );


      if (!selectedKey) {
        return;
      }


      let deleteKeys;


      if (
        a8RippleRangeKeys.length >
          1 &&
        a8RippleRangeKeys.includes(
          selectedKey
        )
      ) {
        deleteKeys =
          new Set(
            a8RippleRangeKeys
          );

      } else {
        deleteKeys =
          new Set([
            selectedKey
          ]);
      }


      const selectedIndex =
        sequence.findIndex(
          logical =>
            deleteKeys.has(
              logical.key
            )
        );


      const nextSequence =
        sequence.filter(
          logical =>
            !deleteKeys.has(
              logical.key
            )
        );


      let nextKey =
        null;


      if (
        nextSequence.length
      ) {
        const index =
          Math.min(
            Math.max(
              selectedIndex,
              0
            ),
            nextSequence.length -
              1
          );


        nextKey =
          nextSequence[
            index
          ].key;
      }


      a8RippleRangeKeys =
        nextKey
          ? [nextKey]
          : [];


      a8RippleAnchorKey =
        nextKey;


      a8RippleReflow(
        nextSequence,
        nextKey
      );
    };


  function a8RippleCopyRange() {
    const sequence =
      a8RippleSequence();


    const range =
      a8RippleCurrentRange(
        sequence
      );


    if (!range.length) {
      throw new Error(
        'SELECT A NOTE OR REST FIRST'
      );
    }


    a8RippleClipboard =
      range.map(
        logical => ({
          event:
            a8RippleStripTie({
              ...logical.event,

              durationA8:
                a8ForSlots(
                  logical.slots
                )
            }),

          slots:
            logical.slots
        })
      );


    showMessage(
      'COPIED ' +
      a8RippleClipboard.length +
      (
        a8RippleClipboard.length ===
          1
          ? ' EVENT'
          : ' EVENTS'
      ),
      true
    );


    a8RippleEnsureControls();
  }


  function a8RipplePasteAfter() {
    if (
      !a8RippleClipboard.length
    ) {
      throw new Error(
        'RIPPLE CLIPBOARD IS EMPTY'
      );
    }


    const sequence =
      a8RippleSequence();


    const selectedKey =
      a8RippleSelectedKey(
        sequence
      );


    if (!selectedKey) {
      throw new Error(
        'SELECT INSERTION EVENT FIRST'
      );
    }


    const index =
      sequence.findIndex(
        logical =>
          logical.key ===
            selectedKey
      );


    if (
      index <
        0
    ) {
      throw new Error(
        'INSERTION EVENT NOT FOUND'
      );
    }


    const copies =
      a8RippleClipboard.map(
        item => {
          const key =
            a8RippleNewKey();


          const event =
            a8RippleStripTie({
              ...item.event,

              id:
                nextEventId++,

              durationA8:
                a8ForSlots(
                  item.slots
                )
            });


          return {
            key,

            event,

            slots:
              item.slots,

            preferredTieId:
              null
          };
        }
      );


    sequence.splice(
      index + 1,
      0,
      ...copies
    );


    a8RippleRangeKeys =
      copies.map(
        logical =>
          logical.key
      );


    a8RippleAnchorKey =
      copies[0].key;


    a8RippleReflow(
      sequence,
      copies[0].key
    );


    showMessage(
      'PASTED ' +
      copies.length +
      (
        copies.length ===
          1
          ? ' EVENT · RIPPLE REFLOW'
          : ' EVENTS · RIPPLE REFLOW'
      ),
      true
    );
  }


  function a8RippleDeleteRange() {
    if (
      !a8RippleRangeKeys.length
    ) {
      throw new Error(
        'SELECT A RANGE FIRST'
      );
    }


    deleteSelected();


    showMessage(
      'RANGE DELETED · SEQUENCE COLLAPSED',
      true
    );
  }


  function a8RipplePaintSelection() {
    const wanted =
      new Set(
        a8RippleRangeKeys
      );


    document
      .querySelectorAll(
        '#bars .score-chip'
      )
      .forEach(
        chip => {
          const id =
            Number(
              chip.dataset
                .eventId
            );


          const key =
            a8RippleKeyByEventId
              .get(
                id
              );


          chip.classList
            .toggle(
              'a8-ripple-range',
              Boolean(
                key &&
                wanted.has(
                  key
                )
              )
            );
        }
      );
  }


  function a8RippleUpdateInspector() {
    const found =
      selectedEvent();


    if (!found) {
      return;
    }


    const sequence =
      a8RippleSequence();


    const key =
      a8RippleSelectedKey(
        sequence
      );


    const logical =
      a8RippleLogicalByKey(
        sequence,
        key
      );


    if (!logical) {
      return;
    }


    const durationRead =
      document.getElementById(
        'selectedDuration'
      );


    if (
      durationRead
    ) {
      durationRead.textContent =
        (
          a8ForSlots(
            logical.slots
          ) +
          ' A8s · ' +
          logical.slots +
          (
            logical.slots ===
              1
              ? ' logical slot'
              : ' logical slots'
          )
        );
    }
  }


  function a8RippleEnsureStyle() {
    if (
      document.getElementById(
        'a8RippleFabricStyle'
      )
    ) {
      return;
    }


    const style =
      document.createElement(
        'style'
      );


    style.id =
      'a8RippleFabricStyle';


    style.textContent = `
      .score-chip.a8-ripple-range {
        outline:
          2px solid
          currentColor;
        outline-offset:
          2px;
      }

      .a8-ripple-controls {
        margin-top:
          .85rem;
        padding-top:
          .75rem;
        border-top:
          1px solid
          rgba(255,255,255,.15);
      }

      .a8-ripple-controls .a8-ripple-actions {
        display:
          flex;
        flex-wrap:
          wrap;
        gap:
          .45rem;
        margin-top:
          .45rem;
      }

      .a8-ripple-controls .a8-ripple-read {
        opacity:
          .8;
        font-size:
          .86rem;
      }
    `;


    document.head.appendChild(
      style
    );
  }


  function a8RippleEnsureControls() {
    a8RippleEnsureStyle();


    const host =
      document.getElementById(
        'a8RippleToolbarHost'
      );


    if (!host) {
      return;
    }


    let controls =
      document.getElementById(
        'a8RippleControls'
      );


    if (!controls) {
      controls =
        document.createElement(
          'div'
        );


      controls.id =
        'a8RippleControls';


      controls.className =
        'a8-ripple-controls';


      controls.innerHTML = `
        <div
          class="a8-ripple-actions"
        >
          <button
            type="button"
            id="a8RippleCopy"
          >
            COPY RANGE
          </button>

          <button
            type="button"
            id="a8RipplePaste"
          >
            PASTE AFTER
          </button>

          <button
            type="button"
            id="a8RippleDeleteRange"
          >
            DELETE RANGE
          </button>
        </div>

        <div
          class="a8-ripple-read"
          id="a8RippleRead"
          style="margin-top:.4rem"
        ></div>

        <div
          class="a8-ripple-read"
          style="margin-top:.25rem"
        >
          Click one event · Shift-click another
          to select a continuous range across bars.
        </div>
      `;


      host.appendChild(
        controls
      );
    }


    const read =
      document.getElementById(
        'a8RippleRead'
      );


    if (
      read
    ) {
      const count =
        a8RippleRangeKeys
          .length;


      read.textContent =
        (
          count
            ? (
                count +
                (
                  count === 1
                    ? ' logical event selected'
                    : ' logical events selected'
                )
              )
            : 'No ripple range selected'
        ) +
        ' · clipboard ' +
        a8RippleClipboard.length;
    }


    const paste =
      document.getElementById(
        'a8RipplePaste'
      );


    if (
      paste
    ) {
      paste.disabled =
        !a8RippleClipboard.length;
    }
  }


  /*
   * Wrap normal rendering only to paint the
   * logical range and show total logical duration.
   *
   * Existing bar renderer / inspector remain the
   * canonical UI implementation.
   */
  const a8RippleBaseRender =
    render;


  render =
    function () {
      a8RippleBaseRender();

      a8RippleEnsureControls();
      a8RippleUpdateInspector();
      a8RipplePaintSelection();
    };


  /*
   * Range selection:
   *
   * click       = anchor one logical event
   * Shift-click = contiguous logical range
   *
   * Existing normal event selection happens first.
   */
  $('bars')
    .addEventListener(
      'click',
      event => {
        const chip =
          event.target.closest(
            '.score-chip'
          );


        if (!chip) {
          return;
        }


        const id =
          Number(
            chip.dataset
              .eventId
          );


        const sequence =
          a8RippleSequence();


        const key =
          a8RippleKeyByEventId
            .get(
              id
            );


        if (!key) {
          return;
        }


        if (
          event.shiftKey &&
          a8RippleAnchorKey
        ) {
          const keys =
            sequence.map(
              logical =>
                logical.key
            );


          const a =
            keys.indexOf(
              a8RippleAnchorKey
            );


          const b =
            keys.indexOf(
              key
            );


          if (
            a >= 0 &&
            b >= 0
          ) {
            const lo =
              Math.min(
                a,
                b
              );


            const hi =
              Math.max(
                a,
                b
              );


            a8RippleRangeKeys =
              keys.slice(
                lo,
                hi + 1
              );

          } else {
            a8RippleAnchorKey =
              key;

            a8RippleRangeKeys =
              [key];
          }

        } else {
          a8RippleAnchorKey =
            key;

          a8RippleRangeKeys =
            [key];
        }


        a8RippleEnsureControls();
        a8RipplePaintSelection();
      }
    );


  $('a8RippleToolbarHost')
    .addEventListener(
      'click',
      event => {
        try {
          if (
            event.target.closest(
              '#a8RippleCopy'
            )
          ) {
            a8RippleCopyRange();
            return;
          }


          if (
            event.target.closest(
              '#a8RipplePaste'
            )
          ) {
            a8RipplePasteAfter();
            return;
          }


          if (
            event.target.closest(
              '#a8RippleDeleteRange'
            )
          ) {
            a8RippleDeleteRange();
          }

        } catch (
          error
        ) {
          showError(
            error
          );
        }
      }
    );



  /* A8-RIPPLE-INSERT-V1.1-BEGIN */

  /*
   * INSERTION RIPPLE
   * ================
   *
   * Old Composer insertion asks whether the
   * physical target BAR has room.
   *
   * When a logical event is selected we now
   * bypass that obsolete question:
   *
   * selected logical event
   *      ↓
   * insert new logical event after it
   *      ↓
   * whole score reflow
   *
   * A full bar therefore cannot block insertion.
   */

  const a8RippleBaseAddPaletteItem =
    addPaletteItem;


  addPaletteItem =
    function (
      payload,
      index =
        null
    ) {
      const found =
        selectedEvent();


      /*
       * No selected event:
       *
       * Preserve the old drag/drop/open-bar
       * behavior exactly.
       */
      if (!found) {
        return (
          a8RippleBaseAddPaletteItem(
            payload,
            index
          )
        );
      }


      const sequence =
        a8RippleSequence();


      const selectedKey =
        a8RippleSelectedKey(
          sequence
        );


      const selectedIndex =
        sequence.findIndex(
          logical =>
            logical.key ===
              selectedKey
        );


      if (
        selectedIndex <
          0
      ) {
        throw new Error(
          'SELECTED RIPPLE EVENT NOT FOUND'
        );
      }


      const event =
        payload.type ===
          'rest'
          ? makeRest()
          : makeNote(
              payload
            );


      const key =
        a8RippleNewKey();


      const logical = {
        key,

        event,

        slots:
          slotsForDuration(
            event.durationA8
          ),

        preferredTieId:
          null
      };


      sequence.splice(
        selectedIndex + 1,
        0,
        logical
      );


      a8RippleAnchorKey =
        key;


      a8RippleRangeKeys =
        [
          key
        ];


      a8RippleReflow(
        sequence,
        key
      );


      showMessage(
        (
          event.type ===
            'rest'
            ? 'REST'
            : (
                event.noteName ||
                event.label ||
                'NOTE'
              )
        ) +
        ' INSERTED AFTER SELECTED · RIPPLE REFLOW',
        true
      );
    };


  /*
   * Inspector REST AFTER controls use the
   * identical logical insertion path.
   */
  insertRestAfterSelected =
    function (
      duration
    ) {
      const found =
        selectedEvent();


      if (!found) {
        return;
      }


      const sequence =
        a8RippleSequence();


      const selectedKey =
        a8RippleSelectedKey(
          sequence
        );


      const selectedIndex =
        sequence.findIndex(
          logical =>
            logical.key ===
              selectedKey
        );


      if (
        selectedIndex <
          0
      ) {
        throw new Error(
          'SELECTED RIPPLE EVENT NOT FOUND'
        );
      }


      const rest =
        makeRest(
          duration
        );


      const key =
        a8RippleNewKey();


      sequence.splice(
        selectedIndex + 1,
        0,
        {
          key,

          event:
            rest,

          slots:
            slotsForDuration(
              rest.durationA8
            ),

          preferredTieId:
            null
        }
      );


      a8RippleAnchorKey =
        key;


      a8RippleRangeKeys =
        [
          key
        ];


      a8RippleReflow(
        sequence,
        key
      );


      showMessage(
        rest.durationA8 +
        ' A8s REST INSERTED · RIPPLE REFLOW',
        true
      );
    };


  /* A8-RIPPLE-INSERT-V1.1-END */


  /* A8-RIPPLE-PLAYBACK-V1-BEGIN */

  /*
   * Any former per-bar PLAY button now auditions
   * the entire continuous sheet.
   *
   * Existing songPreviewScore() remains the score
   * builder. Existing A8MusicPlayerV1 remains the
   * player. No new timing path is introduced.
   */

  /*
   * Ripple-aware audition score.
   *
   * Unlike the historical submission/song builder,
   * audition does NOT require every occupied bar
   * to contain exactly 64 slots.
   *
   * Current bar positions remain exact:
   * global slot = barIndex * 64 + local start.
   */
  function a8RippleAuditionScore() {
    /*
     * AUDITION USES LOGICAL EVENTS.
     *
     * Physical barline tie fragments are score
     * accounting only. Ripple Fabric reconstructs
     * them into one logical sustained NOTE before
     * handing anything to the player.
     *
     * Therefore audition has:
     *   no tieId
     *   no tiePrev
     *   no tieNext
     *
     * One musical note = one playback event.
     */

    const sequence =
      a8RippleSequence();


    if (!sequence.length) {
      throw new Error(
        'NO MUSIC TO PLAY'
      );
    }


    const output =
      [];


    let cursor =
      0;


    sequence.forEach(
      logical => {
        const event =
          logical.event;


        const out = {
          type:
            event.type,

          eventId:
            event.id,

          label:
            event.label,

          startA8:
            a8ForSlots(
              cursor
            ),

          durationA8:
            a8ForSlots(
              logical.slots
            )
        };


        if (
          event.type ===
            'note'
        ) {
          Object.assign(
            out,
            {
              cyclesPerA8Second:
                event.cyclesPerA8Second,

              waveform:
                event.waveform,

              motion:
                event.motion,

              gain:
                event.gain
            }
          );
        }


        output.push(
          out
        );


        cursor +=
          logical.slots;
      }
    );


    return {
      format:
        'A8M-1',

      title:
        $('songTitle')
          .value
          .trim() ||
        'Untitled A8 composition',

      pitchUnit:
        'cycles / A8 second',

      events:
        output
    };
  }

  /*
   * ONE PAGE PLAY CONTROL
   * ---------------------
   *
   * Historical per-bar PLAY controls are removed
   * after every render.
   *
   * Musical playback remains owned by the existing
   * Ripple audition score + A8MusicPlayerV1.
   */
  function a8RippleRemoveBarPlayControls() {
    document
      .querySelectorAll(
        '[data-bar-action="play"]'
      )
      .forEach(
        button =>
          button.remove()
      );
  }


  const a8RippleNoBarPlayBaseRender =
    render;


  render =
    function () {
      a8RippleNoBarPlayBaseRender();
      a8RippleRemoveBarPlayControls();
    };


  a8RippleRemoveBarPlayControls();


  $('playSong')
    .addEventListener(
      'click',
      event => {
        event.preventDefault();
        event.stopImmediatePropagation();

        try {
          player
            .play(
              a8RippleAuditionScore()
            )
            .catch(
              showError
            );

        } catch (error) {
          showError(
            error
          );
        }
      },
      true
    );


  /* A8-RIPPLE-NOTE-AUDITION-V1-BEGIN */

  /*
   * NOTE AUDITION
   * =============
   *
   * Selection may point at one physical piece
   * of a note split over a barline.
   *
   * Ripple Fabric first reconstructs the
   * LOGICAL note, then auditions that one note
   * from relative start 0 for its full duration.
   *
   * No tie metadata enters the player.
   */

  function a8RippleSelectedAuditionScore() {
    const found =
      selectedEvent();


    if (!found) {
      throw new Error(
        'SELECT A NOTE FIRST'
      );
    }


    const sequence =
      a8RippleSequence();


    const key =
      a8RippleSelectedKey(
        sequence
      );


    const logical =
      a8RippleLogicalByKey(
        sequence,
        key
      );


    if (!logical) {
      throw new Error(
        'SELECTED LOGICAL NOTE NOT FOUND'
      );
    }


    if (
      logical.event.type !==
        'note'
    ) {
      throw new Error(
        'SELECTED EVENT IS A REST'
      );
    }


    const event =
      logical.event;


    return {
      format:
        'A8M-1',

      title:
        'Selected note preview',

      pitchUnit:
        'cycles / A8 second',

      events: [
        {
          type:
            'note',

          eventId:
            event.id,

          label:
            event.label,

          startA8:
            '0',

          durationA8:
            a8ForSlots(
              logical.slots
            ),

          cyclesPerA8Second:
            event.cyclesPerA8Second,

          waveform:
            event.waveform,

          motion:
            event.motion,

          gain:
            event.gain
        }
      ]
    };
  }


  /*
   * NOTE AUDITION
   * -------------
   *
   * The compact note editor owns the control.
   * Arranger requests audition through one event.
   *
   * Composer/player retain playback authority.
   */
  window.addEventListener(
    'a8-arranger-audition-selected',
    () => {

      try {

        player
          .play(
            a8RippleSelectedAuditionScore()
          )
          .catch(
            showError
          );

      } catch (
        error
      ) {

        showError(
          error
        );
      }
    }
  );


  /*
   * AUDITION ALL
   * ------------
   *
   * Same continuous Ripple audition score used
   * by the main PLAY control.
   *
   * No second timing or playback path.
   */
  window.addEventListener(
    'a8-arranger-audition-all',
    () => {

      try {

        player
          .play(
            a8RippleAuditionScore()
          )
          .catch(
            showError
          );

      } catch (
        error
      ) {

        showError(
          error
        );
      }
    }
  );


  /* A8-RIPPLE-NOTE-AUDITION-V1-END */

  /* A8-RIPPLE-PLAYBACK-V1-END */

  /* A8-RIPPLE-FABRIC-V1-END */

  installVisibleDurationControls();

  /*
   * Preserve existing score serialization exactly and layer
   * explicit tie metadata onto note events.
   */
  const a8BaseSongPreviewScore =
    songPreviewScore;


  songPreviewScore =
    function () {
      const score =
        a8BaseSongPreviewScore();


      const sourceEvents =
        bars
          .filter(
            bar =>
              bar.events.length
          )
          .flatMap(
            bar =>
              bar.events
          );


      if (
        Array.isArray(
          score.events
        ) &&
        score.events.length ===
          sourceEvents.length
      ) {
        score.events.forEach(
          (
            out,
            index
          ) => {
            const source =
              sourceEvents[
                index
              ];


            if (
              source &&
              source.type ===
                'note' &&
              source.tieId
            ) {
              out.tieId =
                source.tieId;

              out.tiePrev =
                source.tiePrev ===
                true;

              out.tieNext =
                source.tieNext ===
                true;
            }
          }
        );
      }


      return score;
    };


  const a8BaseSaveScore =
    saveScore;


  saveScore =
    function () {
      const score =
        a8BaseSaveScore();


      score.timing = {
        ...(
          score.timing ||
          {}
        ),

        tiesExplicit:
          true
      };


      const sourceBars =
        bars.filter(
          bar =>
            bar.events.length
        );


      if (
        Array.isArray(
          score.bars
        )
      ) {
        score.bars.forEach(
          (
            outBar,
            barIndex
          ) => {
            const sourceBar =
              sourceBars[
                barIndex
              ];


            if (
              !sourceBar ||
              !Array.isArray(
                outBar.events
              )
            ) {
              return;
            }


            outBar.events.forEach(
              (
                out,
                eventIndex
              ) => {
                const source =
                  sourceBar.events[
                    eventIndex
                  ];


                if (
                  source &&
                  source.type ===
                    'note' &&
                  source.tieId
                ) {
                  out.tieId =
                    source.tieId;

                  out.tiePrev =
                    source.tiePrev ===
                      true;

                  out.tieNext =
                    source.tieNext ===
                      true;
                }
              }
            );
          }
        );
      }


      return score;
    };


  const a8BaseImportScore =
    importScore;


  importScore =
    function (
      score
    ) {
      a8BaseImportScore(
        score
      );


      if (
        !score ||
        !Array.isArray(
          score.bars
        )
      ) {
        return;
      }


      score.bars.forEach(
        (
          sourceBar,
          barIndex
        ) => {
          const liveBar =
            bars[
              barIndex
            ];


          if (
            !liveBar ||
            !Array.isArray(
              sourceBar.events
            )
          ) {
            return;
          }


          sourceBar.events.forEach(
            (
              source,
              eventIndex
            ) => {
              const live =
                liveBar.events[
                  eventIndex
                ];


              if (
                live &&
                live.type ===
                  'note' &&
                source.tieId
              ) {
                live.tieId =
                  String(
                    source.tieId
                  );

                live.tiePrev =
                  source.tiePrev ===
                    true;

                live.tieNext =
                  source.tieNext ===
                    true;
              }
            }
          );
        }
      );


      render();
    };


  renderLegend();

  render();


  /*
   * ==========================================================
   * A8 CHARLIE ARRANGER V1A
   * EXPERIMENTAL SELECTED-NOTE CONTROL SURFACE
   * ==========================================================
   *
   * This API exists ONLY in the Charlie laboratory copy.
   *
   * It does not define time.
   * It does not alter the A8 transport.
   * It edits properties of the already-selected score note.
   */

  function a8LabNumber(
    value
  ) {
    const text =
      String(
        value ?? ''
      ).trim();

    if (
      text.includes('/')
    ) {
      const parts =
        text.split('/');

      if (
        parts.length !==
        2
      ) {
        throw new Error(
          'INVALID A8 NUMBER'
        );
      }

      const n =
        Number(
          parts[0]
        );

      const d =
        Number(
          parts[1]
        );

      if (
        !Number.isFinite(n) ||
        !Number.isFinite(d) ||
        d === 0
      ) {
        throw new Error(
          'INVALID A8 NUMBER'
        );
      }

      return n / d;
    }

    const n =
      Number(
        text
      );

    if (
      !Number.isFinite(n)
    ) {
      throw new Error(
        'INVALID A8 NUMBER'
      );
    }

    return n;
  }


  function a8LabSelectedNote() {
    const found =
      selectedEvent();

    if (
      !found ||
      !found.event ||
      found.event.type !==
        'note'
    ) {
      return null;
    }

    return found.event;
  }


  function a8LabSnapshot() {

    const found =
      selectedEvent();


    if (
      !found ||
      !found.event
    ) {
      return null;
    }


    const event =
      found.event;


    const isNote =
      event.type ===
        'note';


    return {
      id:
        event.id,

      type:
        event.type,

      noteName:
        isNote
          ? (
              event.noteName ??
              null
            )
          : 'REST',

      octaveShift:
        isNote &&
        Number.isInteger(
          event.octaveShift
        )
          ? event.octaveShift
          : 0,

      label:
        isNote
          ? (
              event.label ||
              event.noteName ||
              'Note'
            )
          : 'REST',

      cyclesPerA8Second:
        isNote
          ? event.cyclesPerA8Second
          : '0',

      durationA8:
        event.durationA8,

      waveform:
        isNote
          ? (
              event.waveform ||
              'sine'
            )
          : 'sine',

      motion:
        isNote
          ? (
              event.motion ||
              'steady'
            )
          : 'steady',

      gain:
        isNote
          ? Number(
              event.gain ??
              0.5
            )
          : 0
    };
  }

  function a8LabEmitSelection() {
    window.dispatchEvent(
      new CustomEvent(
        'a8-arranger-note-selected',
        {
          detail:
            a8LabSnapshot()
        }
      )
    );
  }


  function a8LabRefresh() {
    render();

    const snapshot =
      a8LabSnapshot();

    window.dispatchEvent(
      new CustomEvent(
        'a8-arranger-note-updated',
        {
          detail:
            snapshot
        }
      )
    );

    return snapshot;
  }


  const a8LabSelectEventBase =
    selectEvent;

  selectEvent =
    function (
      ...args
    ) {
      const result =
        a8LabSelectEventBase(
          ...args
        );

      window.setTimeout(
        a8LabEmitSelection,
        0
      );

      return result;
    };


  /*
   * A8 CHARLIE ARRANGER V1B
   *
   * Blank-bar taps select insertion ORDER only.
   * They do not define duration or browser time.
   *
   * The created note still passes through the
   * existing native makeNote() / insertEvent()
   * machinery.
   */

  /*
   * ==========================================================
   * ADD NEXT · LOGICAL INSERTION
   * ==========================================================
   *
   * The selected NOTE is the insertion anchor.
   *
   * If that note crosses one or more bar windows,
   * a8RippleSelectedKey() resolves every physical piece
   * back into one logical event.
   *
   * New music is inserted at logical index + 1.
   * There is intentionally no BEFORE path.
   */
  function a8LabMakeNextNote(
    noteName,
    octaveShift
  ) {

    const shift =
      Number(
        octaveShift
      );


    if (
      !Number.isInteger(
        shift
      ) ||
      shift < -2 ||
      shift > 2
    ) {
      throw new Error(
        'OCTAVE MUST BE -2 THROUGH +2'
      );
    }


    const name =
      String(
        noteName ||
        ''
      ).trim();


    noteReferencePitch(
      name
    );


    return (
      makeNote({
        type:
          'note',

        noteName:
          name,

        octaveShift:
          shift,

        pitch:
          pitchForOctave(
            name,
            shift
          )
      })
    );
  }


  /*
   * ==========================================================
   * FULL BAR ADDITION HANDOFF
   * ==========================================================
   *
   * A bar is a 64-slot VIEW WINDOW.
   *
   * When an insertion is requested immediately after the
   * final event of an exactly-full bar, do not ask the old
   * bar-local insertion engine for spare capacity.
   *
   * Instead:
   *
   *   physical final event
   *       ->
   *   logical Ripple event
   *       ->
   *   splice new logical event AFTER it
   *       ->
   *   reflow the continuous score
   *
   * a8RippleReflow() creates the next bar window whenever
   * the new sequence requires it.
   */
  function a8LabInsertAfterFullBar(
    bar,
    event,
    inheritAnchorDuration =
      false
  ) {

    if (
      !bar ||
      !bar.events.length
    ) {
      throw new Error(
        'FULL BAR INSERTION ANCHOR NOT FOUND'
      );
    }


    const sequence =
      a8RippleSequence();


    const anchorEvent =
      bar.events[
        bar.events.length -
        1
      ];


    const anchorKey =
      a8RippleKeyByEventId
        .get(
          anchorEvent.id
        );


    if (!anchorKey) {
      throw new Error(
        'FULL BAR LOGICAL ANCHOR NOT FOUND'
      );
    }


    const index =
      sequence.findIndex(
        logical =>
          logical.key ===
            anchorKey
      );


    if (
      index <
      0
    ) {
      throw new Error(
        'FULL BAR LOGICAL POSITION NOT FOUND'
      );
    }


    const anchorLogical =
      sequence[
        index
      ];


    let slots =
      slotsForDuration(
        event.durationA8
      );


    /*
     * REST = timed silence.
     *
     * At this exact end-of-bar handoff, a new REST
     * inherits the duration of the preceding logical
     * event just like ADD NEXT REST already does.
     */
    if (
      inheritAnchorDuration
    ) {
      slots =
        anchorLogical.slots;

      event.durationA8 =
        a8ForSlots(
          slots
        );
    }


    const key =
      a8RippleNewKey();


    sequence.splice(
      index + 1,
      0,
      {
        key,

        event:
          a8RippleStripTie(
            event
          ),

        slots,

        preferredTieId:
          null
      }
    );


    a8RippleReflow(
      sequence,
      key
    );


    return (
      a8LabSnapshot()
    );
  }


  /* A8-READONLY-PRESET-LAB-V1-BEGIN */

  const A8_PRESET_MIME =
    'application/x-a8-preset-url';


  /* Phase 1B: isolated drum insert scope; source presets remain read-only. */
  function a8BeatScopedWorkingCopy(score) {
    const mode = document.getElementById('a8BeatInsertScope')?.value || 'eight';
    if (mode === 'eight') return score;
    if (!Array.isArray(score.bars) || score.bars.length !== 8) {
      throw new Error('DRUM SOURCE REQUIRES EIGHT BARS');
    }
    const barIndex = Number(document.getElementById('a8BeatSourceBar')?.value || 0);
    if (!Number.isInteger(barIndex) || barIndex < 0 || barIndex >= 8) {
      throw new Error('SELECT VALID SOURCE BAR');
    }
    const sourceBar = score.bars[barIndex];
    if (mode === 'bar') return {
      ...score, bars: [{...sourceBar, events: [...(sourceBar.events || [])]}]
    };
    if (mode !== 'hit') throw new Error('INVALID DRUM INSERT MODE');
    const notes = (sourceBar.events || []).filter(event => event.type === 'note');
    const hitIndex = Number(document.getElementById('a8BeatSourceHit')?.value || 0);
    if (!Number.isInteger(hitIndex) || hitIndex < 0 || hitIndex >= notes.length) {
      throw new Error('SOURCE BAR HAS NO HIT AT THAT NUMBER');
    }
    const source = notes[hitIndex];
    const durationSlots = slotsForDuration(fracText(source.durationA8));
    if (!Number.isInteger(durationSlots) || durationSlots < 1 || durationSlots > BAR_SLOTS) {
      throw new Error('INVALID SOURCE HIT DURATION');
    }
    const hit = {
      ...source,
      startA8: a8ForSlots(0),
      endA8: a8ForSlots(durationSlots)
    };
    return {
      ...score,
      bars: [{...sourceBar, events: [hit]}],
      a8SingleHitSpanSlots: durationSlots
    };
  }

  function a8BeatScopeControls() {
    const mode = document.getElementById('a8BeatInsertScope');
    const bar = document.getElementById('a8BeatSourceBar');
    const hit = document.getElementById('a8BeatSourceHit');
    if (!mode || !bar || !hit) return;
    const refresh = () => {
      bar.disabled = mode.value === 'eight';
      hit.disabled = mode.value !== 'hit';
    };
    mode.addEventListener('change', refresh);
    refresh();
  }
  a8BeatScopeControls();

  async function a8LoadReadonlyPreset(
    url
  ) {

    const response =
      await fetch(
        url,
        {
          cache:
            'no-store'
        }
      );


    if (!response.ok) {
      throw new Error(
        'PRESET LOAD FAILED · HTTP ' +
        response.status
      );
    }


    const score =
      await response.json();


    if (
      !score ||
      !score.preset ||
      score.preset.readonlySource !==
        true
    ) {
      throw new Error(
        'READ-ONLY A8M PRESET REQUIRED'
      );
    }


    if (
      score.preset.kind ===
        'drum'
    ) {
      a8BeatInstallPreset(
        a8BeatScopedWorkingCopy(score)
      );

      return;
    }


    importScore(
      score
    );


    showMessage(
      (
        score.preset.id ||
        'A8 PRESET'
      ) +
      ' LOADED · WORKING COPY',
      true
    );
  }


  function a8InstallReadonlyPresetLab() {

    const opener =
      document.getElementById(
        'a8PresetOpen'
      );


    const dialog =
      document.getElementById(
        'a8PresetDialog'
      );


    const closer =
      document.getElementById(
        'a8PresetClose'
      );


    const buttons =
      Array.from(
        document.querySelectorAll(
          '[data-a8-preset-url]'
        )
      );


    const barsHost =
      document.getElementById(
        'bars'
      );


    if (
      !opener ||
      !dialog ||
      !closer ||
      !buttons.length ||
      !barsHost
    ) {
      return;
    }


    opener.addEventListener(
      'click',
      () => {

        if (!dialog.open) {
          dialog.show();
        }
      }
    );


    closer.addEventListener(
      'click',
      () => {

        if (dialog.open) {
          dialog.close();
        }
      }
    );


    buttons.forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            a8LoadReadonlyPreset(
              button.dataset
                .a8PresetUrl
            )
              .then(
                () => {

                  if (dialog.open) {
                    dialog.close();
                  }
                }
              )
              .catch(
                showError
              );
          }
        );


        button.addEventListener(
          'dragstart',
          event => {

            event.dataTransfer
              .setData(
                A8_PRESET_MIME,
                button.dataset
                  .a8PresetUrl
              );


            event.dataTransfer
              .effectAllowed =
                'copy';
          }
        );
      }
    );


    barsHost.addEventListener(
      'dragover',
      event => {

        const types =
          Array.from(
            event.dataTransfer
              ?.types ||
            []
          );


        if (
          !types.includes(
            A8_PRESET_MIME
          )
        ) {
          return;
        }


        event.preventDefault();

        event.dataTransfer
          .dropEffect =
            'copy';
      },
      true
    );


    barsHost.addEventListener(
      'drop',
      event => {

        const url =
          event.dataTransfer
            ?.getData(
              A8_PRESET_MIME
            );


        if (!url) {
          return;
        }


        event.preventDefault();
        event.stopImmediatePropagation();


        a8LoadReadonlyPreset(
          url
        )
          .then(
            () => {

              if (dialog.open) {
                dialog.close();
              }
            }
          )
          .catch(
            showError
          );
      },
      true
    );
  }


  a8InstallReadonlyPresetLab();

  /* A8-READONLY-PRESET-LAB-V1-END */

  /* A8-CHORD-LAYER-C-LAB-V1-BEGIN */

  /*
   * LAYER C
   *
   * Melody / Ripple remains Layer A.
   *
   * Layer C is an independent absolute A8 overlay.
   * Chord members therefore do NOT consume Layer A
   * slots and do NOT enter Ripple's sequential cursor.
   *
   * One first-pass chord occupies one addressed bar:
   *
   *   start   = bar address × 64 native slots
   *   length  = 64 native slots = 4 A8 seconds
   *
   * All members of one chord receive the same start.
   *
   * A8MusicPlayerV1 already schedules every event
   * independently, so equal startA8 values are true
   * simultaneous playback.
   */

  let a8ChordLayerC =
    [];


  function a8ChordActiveBarNumber() {

    const index =
      bars.findIndex(
        bar =>
          bar.id ===
            activeBarId
      );


    if (
      index <
      0
    ) {
      throw new Error(
        'ACTIVE BAR NOT FOUND'
      );
    }


    return (
      index +
      1
    );
  }


  function a8ChordNormalizeEvent(
    source
  ) {

    if (
      !source ||
      source.type !==
        'note'
    ) {
      throw new Error(
        'LAYER C REQUIRES NOTE EVENTS'
      );
    }


    const bar =
      Number(
        source.bar
      );


    if (
      !Number.isInteger(
        bar
      ) ||
      bar <
        1
    ) {
      throw new Error(
        'LAYER C BAR ADDRESS REQUIRED'
      );
    }


    const duration =
      fracText(
        source.durationA8
      );


    if (
      slotsForDuration(
        duration
      ) !==
      BAR_SLOTS
    ) {
      throw new Error(
        'LAYER C V1 CHORD MUST BE ONE FULL A8 BAR'
      );
    }


    const pitch =
      fracText(
        source
          .cyclesPerA8Second
      );


    const pitchNumber =
      Number(
        pitch
      );


    if (
      !Number.isFinite(
        pitchNumber
      ) ||
      pitchNumber <=
        0
    ) {
      throw new Error(
        'LAYER C PITCH MUST BE CYCLES / A8 SECOND'
      );
    }


    const gain =
      Number(
        source.gain ??
        0.20
      );


    if (
      !Number.isFinite(
        gain
      ) ||
      gain <
        0 ||
      gain >
        1
    ) {
      throw new Error(
        'LAYER C GAIN MUST BE 0..1'
      );
    }


    const startSlot =
      (
        bar -
        1
      ) *
      BAR_SLOTS;


    return {
      type:
        'note',

      layer:
        'C',

      bar,

      chordId:
        String(
          source.chordId ||
          'A8-CHORD'
        ),

      chordLabel:
        String(
          source.chordLabel ||
          'A8 CHORD'
        ),

      label:
        String(
          source.label ||
          source.noteName ||
          'A8 CHORD NOTE'
        ),

      noteName:
        source.noteName ??
        null,

      octaveShift:
        Number.isInteger(
          source.octaveShift
        )
          ? source.octaveShift
          : null,

      cyclesPerA8Second:
        pitch,

      startA8:
        a8ForSlots(
          startSlot
        ),

      durationA8:
        a8ForSlots(
          BAR_SLOTS
        ),

      endA8:
        a8ForSlots(
          startSlot +
          BAR_SLOTS
        ),

      waveform:
        source.waveform ||
        'triangle',

      motion:
        source.motion ||
        'steady',

      gain,

      /*
       * Working accompaniment level.
       *
       * The read-only chord source keeps its own
       * voice gain.  This mix value belongs to
       * the placed Layer C item.
       */
      mixGain:
        a8LayerClampMixGain(
          source.mixGain
        )
    };
  }


  function a8ChordReadLayer(
    score
  ) {

    const source =
      score &&
      score.layers &&
      score.layers.C &&
      Array.isArray(
        score.layers.C.events
      )
        ? score.layers.C.events
        : [];


    return (
      source.map(
        a8ChordNormalizeEvent
      )
    );
  }


  function a8ChordLayerForSave() {

    return {
      role:
        'CHORDS',

      placement:
        'BAR_ADDRESS',

      events:
        a8ChordLayerC.map(
          event => ({
            ...event
          })
        )
    };
  }


  /*
   * SAVE .A8M
   *
   * Existing A8M-1 bars remain untouched.
   * Layer C is optional additional native data.
   */

  const a8ChordBaseSaveScore =
    saveScore;


  saveScore =
    function () {

      const score =
        a8ChordBaseSaveScore();


      if (
        a8ChordLayerC.length
      ) {
        score.layers = {
          ...(
            score.layers ||
            {}
          ),

          C:
            a8ChordLayerForSave()
        };
      }


      return score;
    };


  /*
   * OPEN .A8M
   *
   * Old note-only / drum A8M files remain valid.
   * No C layer means C simply becomes empty.
   */

  const a8ChordBaseImportScore =
    importScore;


  importScore =
    function (
      score
    ) {

      const incomingLayer =
        a8ChordReadLayer(
          score
        );


      const result =
        a8ChordBaseImportScore(
          score
        );


      a8ChordLayerC =
        incomingLayer;


      const maxBar =
        a8ChordLayerC.reduce(
          (
            current,
            event
          ) =>
            Math.max(
              current,
              event.bar
            ),
          0
        );


      while (
        bars.length <
        maxBar
      ) {
        bars.push(
          makeBar()
        );
      }


      if (
        maxBar >
        0
      ) {
        render();
      }


      return result;
    };


  /*
   * PLAYER PROJECTION
   *
   * Layer A and Layer C meet only here.
   *
   * Each keeps its native A8 start/duration.
   * No timing conversion occurs.
   */

  function a8ChordMergePlayback(
    builder
  ) {

    let score;


    try {

      score =
        builder();

    } catch (
      error
    ) {

      if (
        !a8ChordLayerC.length ||
        !String(
          error &&
          error.message ||
          error
        ).includes(
          'NO MUSIC TO PLAY'
        )
      ) {
        throw error;
      }


      score = {
        format:
          'A8M-1',

        title:
          $('songTitle')
            .value
            .trim() ||
          'Untitled A8 composition',

        pitchUnit:
          'cycles / A8 second',

        events:
          []
      };
    }


    score.events = [
      ...(
        Array.isArray(
          score.events
        )
          ? score.events
          : []
      ),

      ...a8ChordLayerC.map(
        event => ({
          ...event
        })
      )
    ];


    return score;
  }


  const a8ChordBaseSongPreviewScore =
    songPreviewScore;


  songPreviewScore =
    function () {

      return (
        a8ChordMergePlayback(
          a8ChordBaseSongPreviewScore
        )
      );
    };


  const a8ChordBaseRippleAuditionScore =
    a8RippleAuditionScore;


  a8RippleAuditionScore =
    function () {

      return (
        a8ChordMergePlayback(
          a8ChordBaseRippleAuditionScore
        )
      );
    };


  async function a8ChordFetchPreset(
    url
  ) {

    const response =
      await fetch(
        url,
        {
          cache:
            'no-store'
        }
      );


    if (
      !response.ok
    ) {
      throw new Error(
        'CHORD PRESET LOAD FAILED · HTTP ' +
        response.status
      );
    }


    const score =
      await response.json();


    if (
      !score ||
      !score.preset ||
      score.preset.kind !==
        'chord' ||
      score.preset.readonlySource !==
        true
    ) {
      throw new Error(
        'READ-ONLY A8 CHORD PRESET REQUIRED'
      );
    }


    const layer =
      a8ChordReadLayer(
        score
      );


    if (
      layer.length !==
      3
    ) {
      throw new Error(
        'CHORD PRESET MUST CONTAIN THREE A8 NOTES'
      );
    }


    return {
      score,
      layer
    };
  }


  function a8ChordInstallPreset(
    preset
  ) {

    const bar =
      a8ChordActiveBarNumber();


    const chordId =
      String(
        preset
          .score
          .preset
          .id
      );


    const chordLabel =
      String(
        preset
          .score
          .preset
          .noteGroup
      );


    /*
     * First-pass rule:
     * exactly one Layer C chord per bar.
     *
     * Choosing another replaces that addressed bar.
     */
    a8ChordLayerC =
      a8ChordLayerC.filter(
        event =>
          event.bar !==
            bar
      );


    const incoming =
      preset.layer.map(
        event =>
          a8ChordNormalizeEvent({
            ...event,

            bar,

            chordId,

            chordLabel
          })
      );


    a8ChordLayerC.push(
      ...incoming
    );


    render();


    showMessage(
      'LAYER C · BAR ' +
      bar +
      ' · ' +
      chordLabel,
      true
    );
  }


  function a8ChordClearActiveBar() {

    const bar =
      a8ChordActiveBarNumber();


    const before =
      a8ChordLayerC.length;


    a8ChordLayerC =
      a8ChordLayerC.filter(
        event =>
          event.bar !==
            bar
      );


    render();


    showMessage(
      (
        before ===
        a8ChordLayerC.length
      )
        ? (
            'LAYER C · BAR ' +
            bar +
            ' · EMPTY'
          )
        : (
            'LAYER C · BAR ' +
            bar +
            ' · CLEARED'
          ),
      true
    );
  }


  function a8InstallChordLibrary() {

    const dialog =
      document.getElementById(
        'a8PresetDialog'
      );


    const buttons =
      Array.from(
        document.querySelectorAll(
          '[data-a8-chord-preset-url]'
        )
      );


    const clear =
      document.getElementById(
        'a8ChordClearActiveBar'
      );


    if (
      !dialog ||
      !buttons.length ||
      !clear
    ) {
      return;
    }


    buttons.forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            a8ChordFetchPreset(
              button.dataset
                .a8ChordPresetUrl
            )
              .then(
                preset => {

                  a8ChordInstallPreset(
                    preset
                  );


                  if (
                    dialog.open
                  ) {
                    dialog.close();
                  }
                }
              )
              .catch(
                showError
              );
          }
        );
      }
    );


    clear.addEventListener(
      'click',
      () => {

        try {

          a8ChordClearActiveBar();


          if (
            dialog.open
          ) {
            dialog.close();
          }

        } catch (
          error
        ) {

          showError(
            error
          );
        }
      }
    );
  }


  a8InstallChordLibrary();

  /* A8-CHORD-LAYER-C-LAB-V1-END */

  /* A8-LAYER-ABC-LAB-V1-BEGIN */

  /*
   * ==========================================================
   * THREE PARALLEL OCCUPANTS OF ONE BAR ADDRESS
   * ==========================================================
   *
   *   nA = NOTES  · existing Ripple / sequential Layer A
   *   nB = BEAT   · absolute native A8 Layer B
   *   nC = CHORD  · absolute native A8 Layer C
   *
   * BAR remains a VIEW / ADDRESS.
   *
   * B and C never consume A slots.
   *
   * Read-only preset source gains are preserved.
   * Each placed B/C item receives mixGain = 0.35.
   *
   * Playback gain therefore becomes:
   *
   *   source voice gain × working mix gain
   *
   * No score timing changes.
   */


  let a8BeatLayerB =
    [];


  function a8LayerClampMixGain(
    value
  ) {

    const raw =
      Number(
        value ??
        0.35
      );


    const safe =
      Number.isFinite(
        raw
      )
        ? raw
        : 0.35;


    return (
      Math.round(
        Math.min(
          1,
          Math.max(
            0,
            safe
          )
        ) *
        100
      ) /
      100
    );
  }


  function a8LayerClampVoiceGain(
    value
  ) {

    const raw =
      Number(
        value ??
        0.50
      );


    const safe =
      Number.isFinite(
        raw
      )
        ? raw
        : 0.50;


    return (
      Math.min(
        1,
        Math.max(
          0,
          safe
        )
      )
    );
  }


  function a8LayerActiveBarNumber() {

    const index =
      bars.findIndex(
        bar =>
          bar.id ===
            activeBarId
      );


    if (
      index <
      0
    ) {
      throw new Error(
        'ACTIVE BAR NOT FOUND'
      );
    }


    return (
      index +
      1
    );
  }


  function a8LayerSlotsForPosition(
    value
  ) {

    const exact =
      frac(
        value
      );


    const numerator =
      exact[0] *
      16;


    if (
      numerator %
      exact[1] !==
        0
    ) {
      throw new Error(
        'A8 POSITION MUST LAND ON 1/16 SLOT GRID'
      );
    }


    const slots =
      numerator /
      exact[1];


    if (
      !Number.isInteger(
        slots
      ) ||
      slots <
        0
    ) {
      throw new Error(
        'INVALID A8 POSITION'
      );
    }


    return slots;
  }


  function a8BeatNormalizeEvent(
    source
  ) {

    if (
      !source ||
      source.type !==
        'note'
    ) {
      throw new Error(
        'LAYER B REQUIRES NOTE EVENTS'
      );
    }


    const bar =
      Number(
        source.bar
      );


    if (
      !Number.isInteger(
        bar
      ) ||
      bar <
        1
    ) {
      throw new Error(
        'LAYER B BAR ADDRESS REQUIRED'
      );
    }


    const startA8 =
      fracText(
        source.startA8
      );


    const durationA8 =
      fracText(
        source.durationA8
      );


    const startSlot =
      a8LayerSlotsForPosition(
        startA8
      );


    const durationSlots =
      slotsForDuration(
        durationA8
      );


    if (
      durationSlots <
        1
    ) {
      throw new Error(
        'LAYER B DURATION REQUIRED'
      );
    }


    const pitch =
      fracText(
        source
          .cyclesPerA8Second
      );


    if (
      !Number.isFinite(
        Number(
          pitch
        )
      ) ||
      Number(
        pitch
      ) <=
        0
    ) {
      throw new Error(
        'LAYER B PITCH MUST BE CYCLES / A8 SECOND'
      );
    }


    return {
      type:
        'note',

      layer:
        'B',

      bar,

      beatId:
        String(
          source.beatId ||
          'A8-BEAT'
        ),

      beatLabel:
        String(
          source.beatLabel ||
          'A8 BEAT'
        ),

      label:
        String(
          source.label ||
          'A8 BEAT HIT'
        ),

      noteName:
        null,

      octaveShift:
        null,

      cyclesPerA8Second:
        pitch,

      startA8,

      durationA8,

      endA8:
        a8ForSlots(
          startSlot +
          durationSlots
        ),

      waveform:
        source.waveform ||
        'sine',

      motion:
        source.motion ||
        'steady',

      gain:
        a8LayerClampVoiceGain(
          source.gain
        ),

      mixGain:
        a8LayerClampMixGain(
          source.mixGain
        )
    };
  }


  function a8BeatReadLayer(
    score
  ) {

    const source =
      score &&
      score.layers &&
      score.layers.B &&
      Array.isArray(
        score.layers.B.events
      )
        ? score.layers.B.events
        : [];


    return (
      source.map(
        a8BeatNormalizeEvent
      )
    );
  }


  function a8BeatLayerForSave() {

    return {
      role:
        'BEATS',

      placement:
        'BAR_ADDRESS',

      events:
        a8BeatLayerB.map(
          event => ({
            ...event
          })
        )
    };
  }


  function a8BeatInstallPreset(
    score
  ) {

    if (
      !score ||
      !score.preset ||
      score.preset.kind !==
        'drum' ||
      score.preset.readonlySource !==
        true
    ) {
      throw new Error(
        'READ-ONLY A8 DRUM PRESET REQUIRED'
      );
    }


    if (
      !Array.isArray(
        score.bars
      ) ||
      score.bars.length !==
        8
    ) {
      throw new Error(
        'DRUM PRESET MUST CONTAIN 8 A8 BARS'
      );
    }


    const startBar =
      a8LayerActiveBarNumber();


    const endBar =
      startBar +
      score.bars.length -
      1;


    const presetId =
      String(
        score.preset.id ||
        'A8-BEAT'
      );


    const beatId =
      presetId +
      '@BAR-' +
      startBar;


    const beatLabel =
      presetId
        .replace(
          /^A8-/,
          ''
        )
        .replace(
          /-/g,
          ' '
        );


    /*
     * New phrase owns its addressed 8-bar window.
     *
     * B outside the window is untouched.
     */
    a8BeatLayerB =
      a8BeatLayerB.filter(
        event =>
          (
            event.bar <
              startBar ||
            event.bar >
              endBar
          )
      );


    score.bars.forEach(
      (
        sourceBar,
        sourceIndex
      ) => {

        const targetBar =
          startBar +
          sourceIndex;


        if (
          !Array.isArray(
            sourceBar.events
          )
        ) {
          return;
        }


        sourceBar.events.forEach(
          source => {

            if (
              source.type !==
                'note'
            ) {
              return;
            }


            const relativeStart =
              a8LayerSlotsForPosition(
                source.startA8
              );


            const durationSlots =
              slotsForDuration(
                fracText(
                  source.durationA8
                )
              );


            if (
              relativeStart <
                0 ||
              relativeStart +
                durationSlots >
                BAR_SLOTS
            ) {
              throw new Error(
                'DRUM HIT EXCEEDS SOURCE BAR'
              );
            }


            const absoluteStart =
              (
                targetBar -
                1
              ) *
              BAR_SLOTS +
              relativeStart;


            a8BeatLayerB.push(
              a8BeatNormalizeEvent({
                ...source,

                bar:
                  targetBar,

                beatId,

                beatLabel,

                startA8:
                  a8ForSlots(
                    absoluteStart
                  ),

                mixGain:
                  0.35
              })
            );
          }
        );
      }
    );


    while (
      bars.length <
      endBar
    ) {
      bars.push(
        makeBar()
      );
    }


    activeBarId =
      bars[
        startBar -
        1
      ].id;


    render();


    showMessage(
      'LAYER B · ' +
      beatLabel +
      ' · BAR ' +
      startBar +
      ' → ' +
      endBar +
      ' · MIX 35%',
      true
    );
  }


  /*
   * ==========================================================
   * SAVE / OPEN
   * ==========================================================
   */

  const a8LayerABCBaseSaveScore =
    saveScore;


  saveScore =
    function () {

      const score =
        a8LayerABCBaseSaveScore();


      if (
        a8BeatLayerB.length
      ) {

        score.layers = {
          ...(
            score.layers ||
            {}
          ),

          B:
            a8BeatLayerForSave()
        };
      }


      return score;
    };


  const a8LayerABCBaseImportScore =
    importScore;


  importScore =
    function (
      score
    ) {

      const incomingB =
        a8BeatReadLayer(
          score
        );


      const result =
        a8LayerABCBaseImportScore(
          score
        );


      a8BeatLayerB =
        incomingB;


      const maxB =
        a8BeatLayerB.reduce(
          (
            current,
            event
          ) =>
            Math.max(
              current,
              event.bar
            ),
          0
        );


      while (
        bars.length <
        maxB
      ) {
        bars.push(
          makeBar()
        );
      }


      render();


      return result;
    };


  /*
   * ==========================================================
   * PLAYBACK MIX
   * ==========================================================
   */

  function a8LayerPlaybackEvent(
    source
  ) {

    const out = {
      ...source
    };


    if (
      out.layer ===
        'B' ||
      out.layer ===
        'C'
    ) {

      out.gain =
        Math.round(
          (
            a8LayerClampVoiceGain(
              out.gain
            ) *
            a8LayerClampMixGain(
              out.mixGain
            )
          ) *
          10000
        ) /
        10000;
    }


    return out;
  }


  function a8LayerMergePlayback(
    builder
  ) {

    let score;


    try {

      score =
        builder();

    } catch (
      error
    ) {

      if (
        !a8BeatLayerB.length ||
        !String(
          error &&
          error.message ||
          error
        ).includes(
          'NO MUSIC TO PLAY'
        )
      ) {
        throw error;
      }


      score = {
        format:
          'A8M-1',

        title:
          $('songTitle')
            .value
            .trim() ||
          'Untitled A8 composition',

        pitchUnit:
          'cycles / A8 second',

        events:
          []
      };
    }


    const existing =
      (
        Array.isArray(
          score.events
        )
          ? score.events
          : []
      ).map(
        a8LayerPlaybackEvent
      );


    const beats =
      a8BeatLayerB.map(
        a8LayerPlaybackEvent
      );


    score.events = [
      ...existing,
      ...beats
    ];


    return score;
  }


  const a8LayerABCBaseSongPreviewScore =
    songPreviewScore;


  songPreviewScore =
    function () {

      return (
        a8LayerMergePlayback(
          a8LayerABCBaseSongPreviewScore
        )
      );
    };


  const a8LayerABCBaseRippleAuditionScore =
    a8RippleAuditionScore;


  a8RippleAuditionScore =
    function () {

      return (
        a8LayerMergePlayback(
          a8LayerABCBaseRippleAuditionScore
        )
      );
    };


  /*
   * ==========================================================
   * ITEM MIX CONTROLS
   * ==========================================================
   */

  function a8LayerBeatEventsAt(
    bar
  ) {

    return (
      a8BeatLayerB.filter(
        event =>
          event.bar ===
            bar
      )
    );
  }


  function a8LayerChordEventsAt(
    bar
  ) {

    return (
      a8ChordLayerC.filter(
        event =>
          event.bar ===
            bar
      )
    );
  }


  function a8LayerAdjustBeatMix(
    bar,
    delta
  ) {

    const here =
      a8LayerBeatEventsAt(
        bar
      );


    if (!here.length) {
      throw new Error(
        'NO BEAT IN ACTIVE BAR'
      );
    }


    const ids =
      new Set(
        here.map(
          event =>
            event.beatId
        )
      );


    const current =
      a8LayerClampMixGain(
        here[0].mixGain
      );


    const next =
      a8LayerClampMixGain(
        current +
        Number(
          delta
        )
      );


    a8BeatLayerB.forEach(
      event => {

        if (
          ids.has(
            event.beatId
          )
        ) {
          event.mixGain =
            next;
        }
      }
    );


    render();


    showMessage(
      'LAYER B · MIX ' +
      Math.round(
        next *
        100
      ) +
      '%',
      true
    );
  }


  function a8LayerAdjustChordMix(
    bar,
    delta
  ) {

    const here =
      a8LayerChordEventsAt(
        bar
      );


    if (!here.length) {
      throw new Error(
        'NO CHORD IN ACTIVE BAR'
      );
    }


    const current =
      a8LayerClampMixGain(
        here[0].mixGain
      );


    const next =
      a8LayerClampMixGain(
        current +
        Number(
          delta
        )
      );


    here.forEach(
      event => {

        event.mixGain =
          next;
      }
    );


    render();


    showMessage(
      'LAYER C · MIX ' +
      Math.round(
        next *
        100
      ) +
      '%',
      true
    );
  }


  function a8LayerClearBeatPhrase(
    bar
  ) {

    const here =
      a8LayerBeatEventsAt(
        bar
      );


    if (!here.length) {
      throw new Error(
        'NO BEAT IN ACTIVE BAR'
      );
    }


    const ids =
      new Set(
        here.map(
          event =>
            event.beatId
        )
      );


    a8BeatLayerB =
      a8BeatLayerB.filter(
        event =>
          !ids.has(
            event.beatId
          )
      );


    render();


    showMessage(
      'LAYER B · PHRASE CLEARED',
      true
    );
  }


  /*
   * ==========================================================
   * THREE-LANE SCORE VIEW
   * ==========================================================
   */

  function a8LayerInstallStyle() {

    if (
      document.getElementById(
        'a8LayerABCStyle'
      )
    ) {
      return;
    }


    const style =
      document.createElement(
        'style'
      );


    style.id =
      'a8LayerABCStyle';


    style.textContent = `
      .a8-layer-row {
        display:grid;
        grid-template-columns:minmax(4.8rem,6rem) minmax(0,1fr);
        gap:.7rem;
        align-items:start;
        margin:.55rem 0;
      }

      .a8-layer-tag {
        display:flex;
        flex-direction:column;
        gap:.15rem;
        padding:.45rem .35rem;
      }

      .a8-layer-tag strong {
        font-size:1rem;
      }

      .a8-layer-tag small {
        opacity:.72;
        font-size:.68rem;
        letter-spacing:.08em;
      }

      .a8-layer-body {
        min-width:0;
      }

      .a8-layer-track {
        display:grid;
        grid-template-columns:repeat(64,minmax(0,1fr));
        min-height:2.7rem;
        gap:1px;
        align-items:stretch;
        border:1px solid rgba(127,127,127,.32);
        border-radius:.55rem;
        overflow:hidden;
      }

      .a8-layer-hit {
        display:flex;
        align-items:center;
        justify-content:center;
        min-width:0;
        overflow:hidden;
        font-size:.58rem;
        font-weight:700;
        border:1px solid rgba(127,127,127,.35);
        border-radius:.28rem;
      }

      .a8-layer-chord-chip {
        display:flex;
        align-items:center;
        justify-content:center;
        min-width:0;
        padding:.55rem;
        font-weight:700;
        border:1px solid rgba(127,127,127,.35);
        border-radius:.45rem;
      }

      .a8-layer-empty {
        grid-column:1 / span 64;
        min-height:2.7rem;
      }

      .a8-layer-controls {
        display:flex;
        align-items:center;
        flex-wrap:wrap;
        gap:.4rem;
        margin-top:.4rem;
      }

      .a8-layer-mix-read {
        min-width:3.7rem;
        text-align:center;
        font-weight:700;
      }

      .a8-layer-a .music-lane {
        margin:0;
      }

      @media (max-width:700px) {
        .a8-layer-row {
          grid-template-columns:1fr;
          gap:.25rem;
        }

        .a8-layer-tag {
          flex-direction:row;
          align-items:baseline;
          gap:.45rem;
          padding:.2rem .1rem;
        }
      }
    `;


    document.head.appendChild(
      style
    );
  }


  function a8LayerButton(
    text,
    action
  ) {

    const button =
      document.createElement(
        'button'
      );


    button.type =
      'button';


    button.textContent =
      text;


    button.dataset
      .a8LayerAction =
        action;


    return button;
  }


  function a8LayerRow(
    barNumber,
    letter,
    title
  ) {

    const row =
      document.createElement(
        'div'
      );


    row.className =
      'a8-layer-row a8-layer-' +
      letter.toLowerCase();


    row.dataset
      .barNumber =
        String(
          barNumber
        );


    const tag =
      document.createElement(
        'div'
      );


    tag.className =
      'a8-layer-tag';


    const strong =
      document.createElement(
        'strong'
      );


    strong.textContent =
      String(
        barNumber
      ) +
      letter;


    const small =
      document.createElement(
        'small'
      );


    small.textContent =
      title;


    tag.append(
      strong,
      small
    );


    const body =
      document.createElement(
        'div'
      );


    body.className =
      'a8-layer-body';


    row.append(
      tag,
      body
    );


    return {
      row,
      body
    };
  }


  function a8LayerRenderABC() {

    const card =
      document.querySelector(
        '.bar-card.active'
      );


    if (!card) {
      return;
    }


    const laneA =
      Array.from(
        card.children
      ).find(
        node =>
          node.classList &&
          node.classList.contains(
            'music-lane'
          )
      );


    const footer =
      Array.from(
        card.children
      ).find(
        node =>
          node.classList &&
          node.classList.contains(
            'bar-footer'
          )
      );


    if (
      !laneA ||
      !footer
    ) {
      return;
    }


    const barNumber =
      a8LayerActiveBarNumber();


    /*
     * --------------------------
     * A · NOTES
     * --------------------------
     */

    const layerA =
      a8LayerRow(
        barNumber,
        'A',
        'NOTES'
      );


    card.insertBefore(
      layerA.row,
      laneA
    );


    layerA.body.appendChild(
      laneA
    );


    /*
     * --------------------------
     * B · BEAT
     * --------------------------
     */

    const layerB =
      a8LayerRow(
        barNumber,
        'B',
        'BEAT'
      );


    const beatEvents =
      a8LayerBeatEventsAt(
        barNumber
      );


    const beatTrack =
      document.createElement(
        'div'
      );


    beatTrack.className =
      'a8-layer-track';


    const barBase =
      (
        barNumber -
        1
      ) *
      BAR_SLOTS;


    if (
      beatEvents.length
    ) {

      beatEvents
        .slice()
        .sort(
          (
            left,
            right
          ) =>
            a8LayerSlotsForPosition(
              left.startA8
            ) -
            a8LayerSlotsForPosition(
              right.startA8
            )
        )
        .forEach(
          event => {

            const hit =
              document.createElement(
                'span'
              );


            hit.className =
              'a8-layer-hit';


            const relative =
              a8LayerSlotsForPosition(
                event.startA8
              ) -
              barBase;


            const span =
              slotsForDuration(
                event.durationA8
              );


            hit.style.gridColumn =
              (
                relative +
                1
              ) +
              ' / span ' +
              span;


            const pieces =
              String(
                event.label ||
                'B'
              )
                .split(
                  '·'
                );


            hit.textContent =
              pieces[
                pieces.length -
                1
              ]
                .trim()
                .slice(
                  0,
                  4
                );


            hit.title =
              (
                event.beatLabel +
                ' · ' +
                event.startA8 +
                ' · ' +
                event.durationA8 +
                ' A8s'
              );


            beatTrack.appendChild(
              hit
            );
          }
        );

    } else {

      const add =
        a8LayerButton(
          '+ ADD BEAT',
          'open-b'
        );


      add.classList.add(
        'a8-layer-empty'
      );


      beatTrack.appendChild(
        add
      );
    }


    layerB.body.appendChild(
      beatTrack
    );


    const beatControls =
      document.createElement(
        'div'
      );


    beatControls.className =
      'a8-layer-controls';


    if (
      beatEvents.length
    ) {

      const name =
        document.createElement(
          'strong'
        );


      name.textContent =
        beatEvents[0]
          .beatLabel;


      beatControls.appendChild(
        name
      );


      beatControls.appendChild(
        a8LayerButton(
          '−',
          'mix-b-down'
        )
      );


      const mix =
        document.createElement(
          'span'
        );


      mix.className =
        'a8-layer-mix-read';


      mix.textContent =
        Math.round(
          a8LayerClampMixGain(
            beatEvents[0]
              .mixGain
          ) *
          100
        ) +
        '%';


      beatControls.appendChild(
        mix
      );


      beatControls.appendChild(
        a8LayerButton(
          '+',
          'mix-b-up'
        )
      );


      beatControls.appendChild(
        a8LayerButton(
          'CHANGE',
          'open-b'
        )
      );


      beatControls.appendChild(
        a8LayerButton(
          'CLEAR PHRASE',
          'clear-b'
        )
      );
    }


    layerB.body.appendChild(
      beatControls
    );


    card.insertBefore(
      layerB.row,
      footer
    );


    /*
     * --------------------------
     * C · CHORD
     * --------------------------
     */

    const layerC =
      a8LayerRow(
        barNumber,
        'C',
        'CHORD'
      );


    const chordEvents =
      a8LayerChordEventsAt(
        barNumber
      );


    const chordTrack =
      document.createElement(
        'div'
      );


    chordTrack.className =
      'a8-layer-track';


    if (
      chordEvents.length
    ) {

      const chord =
        document.createElement(
          'div'
        );


      chord.className =
        'a8-layer-chord-chip';


      chord.style.gridColumn =
        '1 / span 64';


      chord.textContent =
        chordEvents[0]
          .chordLabel;


      chordTrack.appendChild(
        chord
      );

    } else {

      const add =
        a8LayerButton(
          '+ ADD CHORD',
          'open-c'
        );


      add.classList.add(
        'a8-layer-empty'
      );


      chordTrack.appendChild(
        add
      );
    }


    layerC.body.appendChild(
      chordTrack
    );


    const chordControls =
      document.createElement(
        'div'
      );


    chordControls.className =
      'a8-layer-controls';


    if (
      chordEvents.length
    ) {

      chordControls.appendChild(
        a8LayerButton(
          '−',
          'mix-c-down'
        )
      );


      const mix =
        document.createElement(
          'span'
        );


      mix.className =
        'a8-layer-mix-read';


      mix.textContent =
        Math.round(
          a8LayerClampMixGain(
            chordEvents[0]
              .mixGain
          ) *
          100
        ) +
        '%';


      chordControls.appendChild(
        mix
      );


      chordControls.appendChild(
        a8LayerButton(
          '+',
          'mix-c-up'
        )
      );


      chordControls.appendChild(
        a8LayerButton(
          'CHANGE',
          'open-c'
        )
      );


      chordControls.appendChild(
        a8LayerButton(
          'CLEAR',
          'clear-c'
        )
      );
    }


    layerC.body.appendChild(
      chordControls
    );


    card.insertBefore(
      layerC.row,
      footer
    );
  }


  const a8LayerABCBaseRender =
    render;


  render =
    function () {

      a8LayerABCBaseRender();

      a8LayerRenderABC();
    };


  /*
   * ==========================================================
   * UI CONTROL DELEGATION
   * ==========================================================
   */

  function a8LayerOpenPreset(
    kind
  ) {

    const opener =
      document.getElementById(
        'a8PresetOpen'
      );


    if (opener) {
      opener.click();
    }


    const selector =
      kind ===
        'C'
        ? '[data-a8-chord-preset-url]'
        : '[data-a8-preset-url]';


    window.setTimeout(
      () => {

        document
          .querySelector(
            selector
          )
          ?.scrollIntoView({
            block:
              'nearest'
          });
      },
      0
    );
  }


  function a8LayerInstallControls() {

    const host =
      document.getElementById(
        'bars'
      );


    if (
      !host ||
      host.dataset
        .a8LayerABC ===
        '1'
    ) {
      return;
    }


    host.dataset
      .a8LayerABC =
        '1';


    host.addEventListener(
      'click',
      event => {

        const button =
          event.target.closest(
            '[data-a8-layer-action]'
          );


        if (
          !button ||
          !host.contains(
            button
          )
        ) {
          return;
        }


        event.preventDefault();
        event.stopPropagation();


        const row =
          button.closest(
            '.a8-layer-row'
          );


        const bar =
          Number(
            row &&
            row.dataset
              .barNumber
          );


        if (
          !Number.isInteger(
            bar
          )
        ) {
          return;
        }


        const action =
          button.dataset
            .a8LayerAction;


        try {

          if (
            action ===
              'open-b'
          ) {
            a8LayerOpenPreset(
              'B'
            );

            return;
          }


          if (
            action ===
              'open-c'
          ) {
            a8LayerOpenPreset(
              'C'
            );

            return;
          }


          if (
            action ===
              'mix-b-down'
          ) {
            a8LayerAdjustBeatMix(
              bar,
              -0.05
            );

            return;
          }


          if (
            action ===
              'mix-b-up'
          ) {
            a8LayerAdjustBeatMix(
              bar,
              0.05
            );

            return;
          }


          if (
            action ===
              'mix-c-down'
          ) {
            a8LayerAdjustChordMix(
              bar,
              -0.05
            );

            return;
          }


          if (
            action ===
              'mix-c-up'
          ) {
            a8LayerAdjustChordMix(
              bar,
              0.05
            );

            return;
          }


          if (
            action ===
              'clear-b'
          ) {
            a8LayerClearBeatPhrase(
              bar
            );

            return;
          }


          if (
            action ===
              'clear-c'
          ) {
            a8ChordClearActiveBar();

            return;
          }

        } catch (
          error
        ) {

          showError(
            error
          );
        }
      }
    );
  }


  a8LayerInstallStyle();
  a8LayerInstallControls();

  /*
   * Repaint current active bar once so the
   * three-lane layout is visible immediately.
   */
  render();

  /* A8-LAYER-ABC-LAB-V1-END */






  window.A8ComposerLabV1 = {
    noteNames() {
      return (
        NOTE_REFERENCE.map(
          row =>
            row[0]
        )
      );
    },


    /*
     * ADD NEXT · NOTE
     */
    insertNoteAfterSelected(
      noteName,
      octaveShift
    ) {

      const event =
        a8LabMakeNextNote(
          noteName,
          octaveShift
        );


      const sequence =
        a8RippleSequence();


      const selectedKey =
        a8RippleSelectedKey(
          sequence
        );


      if (!selectedKey) {
        throw new Error(
          'SELECT A NOTE OR REST FIRST'
        );
      }


      const index =
        sequence.findIndex(
          logical =>
            logical.key ===
              selectedKey
        );


      if (
        index <
        0
      ) {
        throw new Error(
          'SELECTED EVENT NOT FOUND'
        );
      }


      const selectedLogical =
        sequence[
          index
        ];


      if (
        !selectedLogical ||
        ![
          'note',
          'rest'
        ].includes(
          selectedLogical.event.type
        )
      ) {
        throw new Error(
          'SELECT A NOTE OR REST FIRST'
        );
      }


      const key =
        a8RippleNewKey();


      const logical = {
        key,

        event:
          a8RippleStripTie(
            event
          ),

        slots:
          slotsForDuration(
            event.durationA8
          ),

        preferredTieId:
          null
      };


      sequence.splice(
        index + 1,
        0,
        logical
      );


      a8RippleReflow(
        sequence,
        key
      );


      showMessage(
        event.noteName +
        ' · ' +
        octaveText(
          event.octaveShift
        ) +
        ' ADDED NEXT',
        true
      );


      return (
        a8LabSnapshot()
      );
    },


    /*
     * ADD NEXT · REST
     *
     * Duration is explicit native A8 time.
     */
    insertRestAfterSelected() {

      const sequence =
        a8RippleSequence();


      const selectedKey =
        a8RippleSelectedKey(
          sequence
        );


      if (!selectedKey) {
        throw new Error(
          'SELECT A NOTE FIRST'
        );
      }


      const index =
        sequence.findIndex(
          logical =>
            logical.key ===
              selectedKey
        );


      if (
        index <
        0
      ) {
        throw new Error(
          'SELECTED NOTE NOT FOUND'
        );
      }


      const selectedLogical =
        sequence[
          index
        ];


      if (
        !selectedLogical ||
        selectedLogical.event.type !==
          'note'
      ) {
        throw new Error(
          'SELECT A NOTE FIRST'
        );
      }


      /*
       * REST = timed silence.
       *
       * Its initial duration is copied from the
       * selected logical note.
       */
      const slots =
        selectedLogical.slots;


      const rest =
        makeRest(
          a8ForSlots(
            slots
          )
        );


      const key =
        a8RippleNewKey();


      sequence.splice(
        index + 1,
        0,
        {
          key,

          event:
            a8RippleStripTie(
              rest
            ),

          slots,

          preferredTieId:
            null
        }
      );


      /*
       * Reflow moves everything later forward and
       * leaves the new REST selected.
       */
      a8RippleReflow(
        sequence,
        key
      );


      showMessage(
        rest.durationA8 +
        ' A8s REST ADDED NEXT',
        true
      );


      return (
        a8LabSnapshot()
      );
    },


    /*
     * TIMED REST · NORMAL OPEN-BAR INSERT
     *
     * Used by the same REST timing chooser when
     * composing into an empty / open bar.
     */
    insertRestTimed(
      barId,
      index,
      durationA8 =
        '1/4'
    ) {

      const bar =
        barById(
          Number(
            barId
          )
        );


      if (!bar) {
        throw new Error(
          'BAR NOT FOUND'
        );
      }


      const requested =
        makeRest(
          durationA8
        );


      const requestedSlots =
        slotsForDuration(
          requested.durationA8
        );


      if (
        requestedSlots < 1 ||
        requestedSlots > BAR_SLOTS
      ) {
        throw new Error(
          'REST DURATION LIMIT · 1/16 TO 4 A8s'
        );
      }


      const remaining =
        remainingSlots(
          bar
        );


      if (
        remaining <=
        0
      ) {
        throw new Error(
          'BAR IS EXACTLY FULL'
        );
      }


      if (
        requestedSlots >
        remaining
      ) {
        requested.durationA8 =
          a8ForSlots(
            remaining
          );
      }


      let targetIndex =
        Number(
          index
        );


      if (
        !Number.isInteger(
          targetIndex
        )
      ) {
        targetIndex =
          bar.events.length;
      }


      targetIndex =
        Math.max(
          0,
          Math.min(
            bar.events.length,
            targetIndex
          )
        );


      activeBarId =
        bar.id;


      insertEvent(
        bar,
        requested,
        targetIndex
      );


      showMessage(
        requested.durationA8 +
        ' A8s REST INSERTED',
        true
      );


      return {
        type:
          'rest',

        durationA8:
          requested.durationA8,

        barId:
          bar.id
      };
    },


    insertNote(
      barId,
      index,
      noteName,
      octaveShift
    ) {

      const id =
        Number(
          barId
        );


      const bar =
        barById(
          id
        );


      if (!bar) {
        throw new Error(
          'BAR NOT FOUND'
        );
      }


      const shift =
        Number(
          octaveShift
        );


      if (
        !Number.isInteger(
          shift
        ) ||
        shift < -2 ||
        shift > 2
      ) {
        throw new Error(
          'OCTAVE MUST BE -2 THROUGH +2'
        );
      }


      const name =
        String(
          noteName ||
          ''
        ).trim();


      noteReferencePitch(
        name
      );


      let targetIndex =
        Number(
          index
        );


      if (
        !Number.isInteger(
          targetIndex
        )
      ) {
        targetIndex =
          bar.events.length;
      }


      targetIndex =
        Math.max(
          0,
          Math.min(
            bar.events.length,
            targetIndex
          )
        );


      const event =
        makeNote({
          type:
            'note',

          noteName:
            name,

          octaveShift:
            shift,

          pitch:
            pitchForOctave(
              name,
              shift
            )
        });


      const remaining =
        remainingSlots(
          bar
        );


      /*
       * EXACTLY FULL + APPEND AT END
       *
       * Hand directly to the logical Ripple sequence.
       * The next bar window appears automatically.
       */
      if (
        remaining <=
          0
      ) {

        if (
          targetIndex !==
            bar.events.length
        ) {
          throw new Error(
            'FULL BAR MID-STREAM INSERT · USE ADD NEXT'
          );
        }


        const result =
          a8LabInsertAfterFullBar(
            bar,
            event,
            false
          );


        showMessage(
          name +
          ' · ' +
          octaveText(
            shift
          ) +
          ' ADDED AFTER FULL BAR',
          true
        );


        return result;
      }


      /*
       * Existing partial-bar behavior is retained.
       */
      const requestedSlots =
        slotsForDuration(
          event.durationA8
        );


      if (
        requestedSlots >
          remaining
      ) {
        event.durationA8 =
          a8ForSlots(
            remaining
          );
      }


      activeBarId =
        bar.id;


      insertEvent(
        bar,
        event,
        targetIndex
      );


      showMessage(
        name +
        ' · ' +
        octaveText(
          shift
        ) +
        ' INSERTED · TAP NOTE TO ADJUST',
        true
      );


      return (
        a8LabSnapshot()
      );
    },


    insertRest(
      barId,
      index
    ) {

      const bar =
        barById(
          barId
        );


      if (!bar) {
        throw new Error(
          'BAR NOT FOUND'
        );
      }


      let targetIndex =
        Number(
          index
        );


      if (
        !Number.isInteger(
          targetIndex
        )
      ) {
        targetIndex =
          bar.events.length;
      }


      targetIndex =
        Math.max(
          0,
          Math.min(
            bar.events.length,
            targetIndex
          )
        );


      const remaining =
        remainingSlots(
          bar
        );


      /*
       * Exactly-full bar:
       *
       * REST is inserted after the final logical event,
       * inherits its duration, and Ripple opens the next
       * bar window.
       */
      if (
        remaining <=
          0
      ) {

        if (
          targetIndex !==
            bar.events.length
        ) {
          throw new Error(
            'FULL BAR MID-STREAM INSERT · USE ADD NEXT'
          );
        }


        const result =
          a8LabInsertAfterFullBar(
            bar,
            makeRest(),
            true
          );


        showMessage(
          result.durationA8 +
          ' A8s REST ADDED AFTER FULL BAR',
          true
        );


        return result;
      }


      /*
       * Existing non-full insertion path.
       */
      activeBarId =
        bar.id;


      addPaletteItem(
        {
          type:
            'rest'
        },
        targetIndex
      );


      return {
        type:
          'rest',

        barId:
          bar.id
      };
    },


    selectedNote() {
      return (
        a8LabSnapshot()
      );
    },


    adjustPitch(
      delta
    ) {
      const event =
        a8LabSelectedNote();

      if (!event) {
        throw new Error(
          'SELECT A NOTE'
        );
      }

      const current =
        a8LabNumber(
          event
            .cyclesPerA8Second
        );

      const change =
        Number(
          delta
        );

      if (
        !Number.isFinite(
          change
        )
      ) {
        throw new Error(
          'INVALID PITCH CHANGE'
        );
      }

      const next =
        Math.max(
          1,
          current +
          change
        );

      event
        .cyclesPerA8Second =
          fracText(
            next
          );

      return (
        a8LabRefresh()
      );
    },


    adjustGain(
      delta
    ) {
      const event =
        a8LabSelectedNote();

      if (!event) {
        throw new Error(
          'SELECT A NOTE'
        );
      }

      const current =
        Number(
          event.gain ??
          0.5
        );

      const change =
        Number(
          delta
        );

      const next =
        Math.min(
          1,
          Math.max(
            0,
            current +
            change
          )
        );

      event.gain =
        Math.round(
          next *
          100
        ) / 100;

      return (
        a8LabRefresh()
      );
    },


    setWaveform(
      value
    ) {
      const event =
        a8LabSelectedNote();

      if (!event) {
        throw new Error(
          'SELECT A NOTE'
        );
      }

      const waveform =
        String(
          value ||
          ''
        )
          .trim()
          .toLowerCase();

      const allowed =
        new Set([
          'sine',
          'triangle',
          'square',
          'sawtooth'
        ]);

      const parts =
        waveform
          .split('+')
          .map(
            part =>
              part.trim()
          )
          .filter(Boolean);

      if (
        !parts.length ||
        parts.some(
          part =>
            !allowed.has(
              part
            )
        )
      ) {
        throw new Error(
          'INVALID VOICE'
        );
      }

      event.waveform =
        parts.join('+');

      return (
        a8LabRefresh()
      );
    },


    setMotion(
      value
    ) {
      const event =
        a8LabSelectedNote();

      if (!event) {
        throw new Error(
          'SELECT A NOTE'
        );
      }

      const motion =
        String(
          value ||
          ''
        )
          .trim()
          .toLowerCase();

      if (
        ![
          'steady',
          'rise',
          'fall',
          'whoosh'
        ].includes(
          motion
        )
      ) {
        throw new Error(
          'INVALID MOTION'
        );
      }

      event.motion =
        motion;

      return (
        a8LabRefresh()
      );
    },


    setDuration(
      value
    ) {
      setSelectedDuration(
        String(
          value
        )
      );

      return (
        a8LabSnapshot()
      );
    },


    adjustDuration(
      deltaSlots
    ) {
      const delta =
        Number(
          deltaSlots
        );

      if (
        delta !== -1 &&
        delta !== 1
      ) {
        throw new Error(
          'DURATION STEP MUST BE ONE NATIVE SLOT'
        );
      }

      adjustSelectedDuration(
        delta
      );

      return (
        a8LabSnapshot()
      );
    },


    deleteNote() {
      deleteSelected();

      window.dispatchEvent(
        new CustomEvent(
          'a8-arranger-note-updated',
          {
            detail:
              null
          }
        )
      );

      return null;
    },


    emitSelection:
      a8LabEmitSelection
  };



  /* A8-PLASTIC-ARDILLA-ABC-V2-BEGIN */

  /*
   * ==========================================================
   * PLASTIC ARDILLA · A / B / C EDITOR V2
   * ==========================================================
   *
   * PRESET = MOULD ONLY.
   *
   * Once inserted:
   *
   *   A = editable note/rest material
   *   B = editable beat-hit material
   *   C = editable chord-group material
   *
   * BAR = DISPLAY WINDOW / ADDRESS.
   * BAR IS NEVER A TIMING WALL.
   *
   * B/C use the same Arranger popup philosophy as A:
   *
   *   click object
   *   -> adjust native timing
   *   -> adjust sound/amplitude where applicable
   *   -> add next
   *   -> delete
   */


  let a8PlasticSelection =
    null;


  let a8PlasticPendingBeatSlot =
    null;


  let a8PlasticPendingChordSlot =
    null;


  let a8PlasticSerial =
    1;


  function a8PlasticId(
    prefix
  ) {

    return (
      prefix +
      '-' +
      Date.now()
        .toString(36) +
      '-' +
      (
        a8PlasticSerial++
      )
        .toString(36)
    );
  }


  function a8PlasticStartSlot(
    event
  ) {

    return (
      a8LayerSlotsForPosition(
        event.startA8
      )
    );
  }


  function a8PlasticDurationSlots(
    event
  ) {

    return (
      slotsForDuration(
        event.durationA8
      )
    );
  }


  function a8PlasticEndSlot(
    event
  ) {

    return (
      a8PlasticStartSlot(
        event
      ) +
      a8PlasticDurationSlots(
        event
      )
    );
  }


  function a8PlasticEnsureBars(
    endSlot
  ) {

    const required =
      Math.max(
        1,
        Math.ceil(
          Number(
            endSlot
          ) /
          BAR_SLOTS
        )
      );


    while (
      bars.length <
      required
    ) {

      bars.push(
        makeBar()
      );
    }
  }


  function a8PlasticMoveEvent(
    event,
    startSlot
  ) {

    const duration =
      a8PlasticDurationSlots(
        event
      );


    event.startA8 =
      a8ForSlots(
        startSlot
      );


    event.endA8 =
      a8ForSlots(
        startSlot +
        duration
      );


    event.bar =
      Math.floor(
        startSlot /
        BAR_SLOTS
      ) +
      1;
  }


  function a8PlasticSetDuration(
    event,
    slots
  ) {

    const start =
      a8PlasticStartSlot(
        event
      );


    event.durationA8 =
      a8ForSlots(
        slots
      );


    event.endA8 =
      a8ForSlots(
        start +
        slots
      );
  }


  function a8PlasticEnsureIds() {

    const chordIds =
      new Map();


    a8BeatLayerB.forEach(
      event => {

        if (!event.hitId) {
          event.hitId =
            a8PlasticId(
              'B-HIT'
            );
        }
      }
    );


    a8ChordLayerC.forEach(
      event => {

        if (event.chordInstanceId) {
          return;
        }


        const key =
          [
            event.chordId || '',
            event.chordLabel || '',
            event.startA8 || '',
            event.durationA8 || ''
          ].join(
            '|'
          );


        if (
          !chordIds.has(
            key
          )
        ) {
          chordIds.set(
            key,
            a8PlasticId(
              'C-CHORD'
            )
          );
        }


        event.chordInstanceId =
          chordIds.get(
            key
          );
      }
    );
  }


  function a8PlasticBeatById(
    id
  ) {

    a8PlasticEnsureIds();


    return (
      a8BeatLayerB.find(
        event =>
          event.hitId ===
            id
      ) ||
      null
    );
  }


  function a8PlasticChordGroup(
    id
  ) {

    a8PlasticEnsureIds();


    return (
      a8ChordLayerC.filter(
        event =>
          event.chordInstanceId ===
            id
      )
    );
  }


  function a8PlasticChordGroups() {

    a8PlasticEnsureIds();


    const map =
      new Map();


    a8ChordLayerC.forEach(
      event => {

        const id =
          event.chordInstanceId;


        if (
          !map.has(
            id
          )
        ) {
          map.set(
            id,
            []
          );
        }


        map.get(
          id
        ).push(
          event
        );
      }
    );


    return (
      Array.from(
        map.values()
      )
        .filter(
          group =>
            group.length
        )
        .sort(
          (
            left,
            right
          ) =>
            a8PlasticStartSlot(
              left[0]
            ) -
            a8PlasticStartSlot(
              right[0]
            )
        )
    );
  }


  function a8PlasticSnapshot() {

    if (!a8PlasticSelection) {
      return null;
    }


    if (
      a8PlasticSelection.layer ===
        'B'
    ) {

      const event =
        a8PlasticBeatById(
          a8PlasticSelection.id
        );


      if (!event) {
        return null;
      }


      return {
        id:
          event.hitId,

        type:
          'note',

        layer:
          'B',

        objectKind:
          'BEAT',

        label:
          event.label ||
          'BEAT',

        noteName:
          'BEAT',

        octaveShift:
          0,

        cyclesPerA8Second:
          event.cyclesPerA8Second,

        durationA8:
          event.durationA8,

        waveform:
          event.waveform ||
          'sine',

        motion:
          event.motion ||
          'steady',

        gain:
          Number(
            event.gain ??
            0.5
          ),

        mixGain:
          a8LayerClampMixGain(
            event.mixGain
          ),

        beatId:
          event.beatId,

        beatLabel:
          event.beatLabel
      };
    }


    if (
      a8PlasticSelection.layer ===
        'C'
    ) {

      const group =
        a8PlasticChordGroup(
          a8PlasticSelection.id
        );


      if (!group.length) {
        return null;
      }


      const first =
        group[0];


      return {
        id:
          first.chordInstanceId,

        type:
          'note',

        layer:
          'C',

        objectKind:
          'CHORD',

        label:
          first.chordLabel ||
          'CHORD',

        noteName:
          first.chordLabel ||
          'CHORD',

        octaveShift:
          0,

        cyclesPerA8Second:
          first.cyclesPerA8Second,

        durationA8:
          first.durationA8,

        waveform:
          first.waveform ||
          'triangle',

        motion:
          first.motion ||
          'steady',

        gain:
          a8LayerClampMixGain(
            first.mixGain
          ),

        chordId:
          first.chordId,

        chordInstanceId:
          first.chordInstanceId,

        chordLabel:
          first.chordLabel
      };
    }


    return null;
  }


  function a8PlasticEmitSelected() {

    const snapshot =
      a8PlasticSnapshot();


    if (!snapshot) {
      return;
    }


    window.dispatchEvent(
      new CustomEvent(
        'a8-arranger-layer-selected',
        {
          detail:
            snapshot
        }
      )
    );
  }


  function a8PlasticEmitUpdated() {

    const snapshot =
      a8PlasticSnapshot();


    window.dispatchEvent(
      new CustomEvent(
        'a8-arranger-note-updated',
        {
          detail:
            snapshot
        }
      )
    );


    if (!snapshot) {

      window.dispatchEvent(
        new CustomEvent(
          'a8-arranger-layer-deleted'
        )
      );
    }
  }


  function a8PlasticSelectBeat(
    id
  ) {

    if (
      !a8PlasticBeatById(
        id
      )
    ) {
      return;
    }


    a8PlasticSelection = {
      layer:
        'B',

      id
    };


    a8PlasticEmitSelected();
  }


  function a8PlasticSelectChord(
    id
  ) {

    if (
      !a8PlasticChordGroup(
        id
      ).length
    ) {
      return;
    }


    a8PlasticSelection = {
      layer:
        'C',

      id
    };


    a8PlasticEmitSelected();
  }


  function a8PlasticMaxEnd(
    events
  ) {

    return (
      events.reduce(
        (
          value,
          event
        ) =>
          Math.max(
            value,
            a8PlasticEndSlot(
              event
            )
          ),
        0
      )
    );
  }


  /*
   * ==========================================================
   * LAYER B · PRESET IS ONLY A STARTING PATTERN
   * ==========================================================
   *
   * Selecting another preset INSERTS material.
   * It does not replace A and it does not own a fixed
   * eight-bar prison after insertion.
   */

  a8BeatInstallPreset =
    function (
      score
    ) {

      if (
        !score ||
        !score.preset ||
        score.preset.kind !==
          'drum' ||
        score.preset.readonlySource !==
          true ||
        !Array.isArray(
          score.bars
        )
      ) {
        throw new Error(
          'READ-ONLY A8 DRUM PRESET REQUIRED'
        );
      }


      const insertion =
        a8PlasticPendingBeatSlot !==
          null
          ? a8PlasticPendingBeatSlot
          : (
              (
                a8LayerActiveBarNumber() -
                1
              ) *
              BAR_SLOTS
            );


      const sourceSlots =
        score.a8SingleHitSpanSlots ??
        (score.bars.length * BAR_SLOTS);

      if (!Number.isInteger(sourceSlots) || sourceSlots < 1) {
        throw new Error('INVALID B INSERT SPAN');
      }


      /*
       * Existing later B material moves later.
       * The preset is inserted, not stamped over it.
       */
      a8BeatLayerB.forEach(
        event => {

          const start =
            a8PlasticStartSlot(
              event
            );


          if (
            start >=
              insertion
          ) {

            a8PlasticMoveEvent(
              event,
              start +
              sourceSlots
            );
          }
        }
      );


      const presetId =
        String(
          score.preset.id ||
          'A8-BEAT'
        );


      const beatId =
        presetId +
        '@' +
        a8PlasticId(
          'PHRASE'
        );


      const beatLabel =
        presetId
          .replace(
            /^A8-/,
            ''
          )
          .replace(
            /-/g,
            ' '
          );


      const added =
        [];


      score.bars.forEach(
        (
          sourceBar,
          barIndex
        ) => {

          if (
            !Array.isArray(
              sourceBar.events
            )
          ) {
            return;
          }


          sourceBar.events.forEach(
            source => {

              if (
                source.type !==
                  'note'
              ) {
                return;
              }


              const relative =
                a8LayerSlotsForPosition(
                  source.startA8
                );


              const start =
                insertion +
                (
                  barIndex *
                  BAR_SLOTS
                ) +
                relative;


              const event =
                a8BeatNormalizeEvent({
                  ...source,

                  bar:
                    Math.floor(
                      start /
                      BAR_SLOTS
                    ) +
                    1,

                  startA8:
                    a8ForSlots(
                      start
                    ),

                  beatId,

                  beatLabel,

                  hitId:
                    a8PlasticId(
                      'B-HIT'
                    ),

                  mixGain:
                    0.35
                });


              a8BeatLayerB.push(
                event
              );


              added.push(
                event
              );
            }
          );
        }
      );


      a8PlasticPendingBeatSlot =
        null;


      a8PlasticEnsureBars(
        insertion +
        sourceSlots
      );


      const openBar =
        Math.floor(
          insertion /
          BAR_SLOTS
        );


      if (
        bars[
          openBar
        ]
      ) {
        activeBarId =
          bars[
            openBar
          ].id;
      }


      render();


      if (
        added.length
      ) {

        a8PlasticSelection = {
          layer:
            'B',

          id:
            added[0]
              .hitId
        };


        window.setTimeout(
          a8PlasticEmitSelected,
          0
        );
      }


      showMessage(
        'LAYER B · ' +
        beatLabel +
        ' · EDITABLE WORKING COPY',
        true
      );
    };


  /*
   * ==========================================================
   * LAYER C · CHORD IS ONE LOGICAL OBJECT
   * ==========================================================
   *
   * Three voices stay locked together.
   * Start and duration belong to the logical chord.
   */

  a8ChordNormalizeEvent =
    function (
      source
    ) {

      if (
        !source ||
        source.type !==
          'note'
      ) {
        throw new Error(
          'LAYER C REQUIRES NOTE EVENTS'
        );
      }


      const suppliedBar =
        Number(
          source.bar ??
          1
        );


      const fallbackStart =
        (
          Math.max(
            1,
            Number.isInteger(
              suppliedBar
            )
              ? suppliedBar
              : 1
          ) -
          1
        ) *
        BAR_SLOTS;


      const startA8 =
        fracText(
          source.startA8 ??
          a8ForSlots(
            fallbackStart
          )
        );


      const startSlot =
        a8LayerSlotsForPosition(
          startA8
        );


      const duration =
        fracText(
          source.durationA8 ??
          '4'
        );


      const durationSlots =
        slotsForDuration(
          duration
        );


      if (
        durationSlots <
          1 ||
        durationSlots >
          BAR_SLOTS
      ) {
        throw new Error(
          'CHORD DURATION MUST BE 1/16 THROUGH 4 A8s'
        );
      }


      const pitch =
        fracText(
          source
            .cyclesPerA8Second
        );


      if (
        !Number.isFinite(
          Number(
            pitch
          )
        ) ||
        Number(
          pitch
        ) <=
          0
      ) {
        throw new Error(
          'LAYER C PITCH MUST BE CYCLES / A8 SECOND'
        );
      }


      const gain =
        Number(
          source.gain ??
          0.20
        );


      if (
        !Number.isFinite(
          gain
        ) ||
        gain <
          0 ||
        gain >
          1
      ) {
        throw new Error(
          'LAYER C GAIN MUST BE 0..1'
        );
      }


      return {
        type:
          'note',

        layer:
          'C',

        bar:
          Math.floor(
            startSlot /
            BAR_SLOTS
          ) +
          1,

        chordId:
          String(
            source.chordId ||
            'A8-CHORD'
          ),

        chordInstanceId:
          source.chordInstanceId
            ? String(
                source.chordInstanceId
              )
            : null,

        chordLabel:
          String(
            source.chordLabel ||
            'A8 CHORD'
          ),

        label:
          String(
            source.label ||
            source.noteName ||
            'A8 CHORD NOTE'
          ),

        noteName:
          source.noteName ??
          null,

        octaveShift:
          Number.isInteger(
            source.octaveShift
          )
            ? source.octaveShift
            : null,

        cyclesPerA8Second:
          pitch,

        startA8,

        durationA8:
          a8ForSlots(
            durationSlots
          ),

        endA8:
          a8ForSlots(
            startSlot +
            durationSlots
          ),

        waveform:
          source.waveform ||
          'triangle',

        motion:
          source.motion ||
          'steady',

        gain,

        mixGain:
          a8LayerClampMixGain(
            source.mixGain
          )
      };
    };


  a8ChordInstallPreset =
    function (
      preset
    ) {

      if (
        !preset ||
        !preset.score ||
        !Array.isArray(
          preset.layer
        ) ||
        preset.layer.length !==
          3
      ) {
        throw new Error(
          'CHORD PRESET MUST CONTAIN THREE A8 NOTES'
        );
      }


      const explicitInsertion =
        a8PlasticPendingChordSlot !==
          null;


      const insertion =
        explicitInsertion
          ? Number(
              a8PlasticPendingChordSlot
            )
          : (
              (
                a8LayerActiveBarNumber() -
                1
              ) *
              BAR_SLOTS
            );


      if (
        !Number.isInteger(
          insertion
        ) ||
        insertion <
          0
      ) {
        throw new Error(
          'INVALID C INSERTION ADDRESS'
        );
      }


      /*
       * Map each logical C chord to its occupied
       * native interval.
       */
      const ranges =
        a8PlasticChordGroups()
          .map(
            group => ({
              start:
                a8PlasticStartSlot(
                  group[0]
                ),

              end:
                a8PlasticEndSlot(
                  group[0]
                )
            })
          )
          .sort(
            (
              left,
              right
            ) =>
              left.start -
              right.start
          );


      /*
       * Critical stack guard:
       *
       * A chord which began earlier may already
       * cross this insertion address.
       *
       * Old code only looked at event.start >=
       * insertion and therefore missed this case.
       */
      const crossing =
        ranges.find(
          range =>
            range.start <
              insertion &&
            range.end >
              insertion
        );


      if (crossing) {
        throw new Error(
          'C INSERTION ADDRESS IS INSIDE EXISTING CHORD'
        );
      }


      const later =
        ranges.filter(
          range =>
            range.start >=
              insertion
        );


      const next =
        later.length
          ? later[0]
          : null;


      let duration =
        BAR_SLOTS;


      let rippleExisting =
        false;


      if (next) {

        if (
          next.start ===
            insertion
        ) {

          const sameStart =
            later.filter(
              range =>
                range.start ===
                  insertion
            );


          if (
            sameStart.length >
              1
          ) {
            throw new Error(
              'C STACK ALREADY PRESENT · DELETE UNWANTED CHORD FIRST'
            );
          }


          /*
           * ADD NEXT at an occupied boundary means
           * insert between logical C events and
           * ripple the following material.
           *
           * Direct +ADD CHORD never stacks there.
           */
          if (explicitInsertion) {

            rippleExisting =
              true;

          } else {

            throw new Error(
              'C INSERTION ADDRESS IS OCCUPIED'
            );
          }

        } else {

          /*
           * Genuine hole.
           *
           * Fill only the free interval available
           * before the next C chord.
           */
          duration =
            Math.min(
              BAR_SLOTS,
              next.start -
                insertion
            );
        }
      }


      if (
        !Number.isInteger(
          duration
        ) ||
        duration <
          1
      ) {
        throw new Error(
          'NO FREE C TIME AT INSERTION ADDRESS'
        );
      }


      if (rippleExisting) {

        a8ChordLayerC.forEach(
          event => {

            const start =
              a8PlasticStartSlot(
                event
              );


            if (
              start >=
                insertion
            ) {

              a8PlasticMoveEvent(
                event,
                start +
                  duration
              );
            }
          }
        );

      } else {

        const overlap =
          ranges.some(
            range =>
              range.start <
                insertion +
                  duration &&
              range.end >
                insertion
          );


        if (overlap) {
          throw new Error(
            'C CHORD WOULD OVERLAP EXISTING C MATERIAL'
          );
        }
      }


      const chordId =
        String(
          preset
            .score
            .preset
            .id
        );


      const chordLabel =
        String(
          preset
            .score
            .preset
            .noteGroup
        );


      const instance =
        a8PlasticId(
          'C-CHORD'
        );


      const incoming =
        preset.layer.map(
          source =>
            a8ChordNormalizeEvent({
              ...source,

              bar:
                Math.floor(
                  insertion /
                  BAR_SLOTS
                ) +
                1,

              startA8:
                a8ForSlots(
                  insertion
                ),

              durationA8:
                a8ForSlots(
                  duration
                ),

              chordId,

              chordInstanceId:
                instance,

              chordLabel,

              mixGain:
                0.35
            })
        );


      a8ChordLayerC.push(
        ...incoming
      );


      a8PlasticPendingChordSlot =
        null;


      a8PlasticEnsureBars(
        insertion +
        duration
      );


      const openBar =
        Math.floor(
          insertion /
          BAR_SLOTS
        );


      if (
        bars[
          openBar
        ]
      ) {
        activeBarId =
          bars[
            openBar
          ].id;
      }


      render();


      a8PlasticSelection = {
        layer:
          'C',

        id:
          instance
      };


      window.setTimeout(
        a8PlasticEmitSelected,
        0
      );


      showMessage(
        'LAYER C · ' +
        chordLabel +
        ' · EDITABLE WORKING COPY',
        true
      );
    };


  /*
   * Old active-bar clear command belongs to the
   * first-pass fixed-bar model.
   *
   * Keep its function harmless for compatibility.
   */

  a8ChordClearActiveBar =
    function () {

      showMessage(
        'CLICK A CHORD · DELETE CHORD',
        true
      );
    };


  /*
   * ==========================================================
   * B/C TIMING EDITS
   * ==========================================================
   */

  function a8PlasticAdjustBeatDuration(
    delta
  ) {

    const snapshot =
      a8PlasticSnapshot();


    if (
      !snapshot ||
      snapshot.layer !==
        'B'
    ) {
      throw new Error(
        'SELECT A BEAT'
      );
    }


    const event =
      a8PlasticBeatById(
        snapshot.id
      );


    const oldSlots =
      a8PlasticDurationSlots(
        event
      );


    const nextSlots =
      oldSlots +
      Number(
        delta
      );


    if (
      nextSlots <
        1 ||
      nextSlots >
        BAR_SLOTS
    ) {
      throw new Error(
        'BEAT DURATION · 1/16 THROUGH 4 A8s'
      );
    }


    const start =
      a8PlasticStartSlot(
        event
      );


    /*
     * B behaves like a continuous lane.
     *
     * Change this hit's duration and move every later
     * B start by the same delta. Simultaneous hits at
     * the same start remain simultaneous.
     */
    a8BeatLayerB.forEach(
      other => {

        if (
          other ===
            event
        ) {
          return;
        }


        const otherStart =
          a8PlasticStartSlot(
            other
          );


        if (
          otherStart >
            start
        ) {

          a8PlasticMoveEvent(
            other,
            otherStart +
            Number(
              delta
            )
          );
        }
      }
    );


    a8PlasticSetDuration(
      event,
      nextSlots
    );


    a8PlasticEnsureBars(
      a8PlasticMaxEnd(
        a8BeatLayerB
      )
    );


    render();
    a8PlasticEmitUpdated();


    return (
      a8PlasticSnapshot()
    );
  }


  function a8PlasticSetBeatDuration(
    value
  ) {

    const snapshot =
      a8PlasticSnapshot();


    if (
      !snapshot ||
      snapshot.layer !==
        'B'
    ) {
      throw new Error(
        'SELECT A BEAT'
      );
    }


    const event =
      a8PlasticBeatById(
        snapshot.id
      );


    const current =
      a8PlasticDurationSlots(
        event
      );


    const target =
      slotsForDuration(
        String(
          value
        )
      );


    return (
      a8PlasticAdjustBeatDuration(
        target -
        current
      )
    );
  }


  function a8PlasticAdjustChordDuration(
    delta
  ) {

    const snapshot =
      a8PlasticSnapshot();


    if (
      !snapshot ||
      snapshot.layer !==
        'C'
    ) {
      throw new Error(
        'SELECT A CHORD'
      );
    }


    const group =
      a8PlasticChordGroup(
        snapshot.id
      );


    if (!group.length) {
      throw new Error(
        'SELECTED CHORD NOT FOUND'
      );
    }


    const first =
      group[0];


    const start =
      a8PlasticStartSlot(
        first
      );


    const oldSlots =
      a8PlasticDurationSlots(
        first
      );


    const nextSlots =
      oldSlots +
      Number(
        delta
      );


    if (
      nextSlots <
        1 ||
      nextSlots >
        BAR_SLOTS
    ) {
      throw new Error(
        'CHORD DURATION · 1/16 THROUGH 4 A8s'
      );
    }


    const oldEnd =
      start +
      oldSlots;


    /*
     * C Ripple:
     *
     * selected logical chord changes duration;
     * every later logical chord moves by same delta.
     */
    a8ChordLayerC.forEach(
      event => {

        if (
          event.chordInstanceId ===
            snapshot.id
        ) {
          return;
        }


        const eventStart =
          a8PlasticStartSlot(
            event
          );


        if (
          eventStart >=
            oldEnd
        ) {

          a8PlasticMoveEvent(
            event,
            eventStart +
            Number(
              delta
            )
          );
        }
      }
    );


    group.forEach(
      event =>
        a8PlasticSetDuration(
          event,
          nextSlots
        )
    );


    a8PlasticEnsureBars(
      a8PlasticMaxEnd(
        a8ChordLayerC
      )
    );


    render();
    a8PlasticEmitUpdated();


    return (
      a8PlasticSnapshot()
    );
  }


  function a8PlasticSetChordDuration(
    value
  ) {

    const snapshot =
      a8PlasticSnapshot();


    if (
      !snapshot ||
      snapshot.layer !==
        'C'
    ) {
      throw new Error(
        'SELECT A CHORD'
      );
    }


    const group =
      a8PlasticChordGroup(
        snapshot.id
      );


    const current =
      a8PlasticDurationSlots(
        group[0]
      );


    const target =
      slotsForDuration(
        String(
          value
        )
      );


    return (
      a8PlasticAdjustChordDuration(
        target -
        current
      )
    );
  }


  /*
   * ==========================================================
   * B/C SOUND + AMPLITUDE
   * ==========================================================
   */

  function a8PlasticAdjustGain(
    delta
  ) {

    const snapshot =
      a8PlasticSnapshot();


    if (!snapshot) {
      throw new Error(
        'SELECT A BEAT OR CHORD'
      );
    }


    if (
      snapshot.layer ===
        'B'
    ) {

      const event =
        a8PlasticBeatById(
          snapshot.id
        );


      event.gain =
        Math.round(
          Math.min(
            1,
            Math.max(
              0,
              Number(
                event.gain ??
                0.5
              ) +
              Number(
                delta
              )
            )
          ) *
          100
        ) /
        100;
    }


    if (
      snapshot.layer ===
        'C'
    ) {

      const group =
        a8PlasticChordGroup(
          snapshot.id
        );


      const next =
        a8LayerClampMixGain(
          Number(
            group[0]
              .mixGain ??
            0.35
          ) +
          Number(
            delta
          )
        );


      group.forEach(
        event => {
          event.mixGain =
            next;
        }
      );
    }


    render();
    a8PlasticEmitUpdated();


    return (
      a8PlasticSnapshot()
    );
  }


  function a8PlasticAdjustBeatPitch(
    delta
  ) {

    const snapshot =
      a8PlasticSnapshot();


    if (
      !snapshot ||
      snapshot.layer !==
        'B'
    ) {
      throw new Error(
        'SELECT A BEAT'
      );
    }


    const event =
      a8PlasticBeatById(
        snapshot.id
      );


    const current =
      a8LabNumber(
        event.cyclesPerA8Second
      );


    event.cyclesPerA8Second =
      fracText(
        Math.max(
          1,
          current +
          Number(
            delta
          )
        )
      );


    render();
    a8PlasticEmitUpdated();


    return (
      a8PlasticSnapshot()
    );
  }


  function a8PlasticSetBeatWave(
    waveform
  ) {

    const event =
      a8PlasticBeatById(
        a8PlasticSelection &&
        a8PlasticSelection.id
      );


    if (!event) {
      throw new Error(
        'SELECT A BEAT'
      );
    }


    event.waveform =
      String(
        waveform
      );


    render();
    a8PlasticEmitUpdated();


    return (
      a8PlasticSnapshot()
    );
  }


  function a8PlasticSetBeatMotion(
    motion
  ) {

    const event =
      a8PlasticBeatById(
        a8PlasticSelection &&
        a8PlasticSelection.id
      );


    if (!event) {
      throw new Error(
        'SELECT A BEAT'
      );
    }


    event.motion =
      String(
        motion
      );


    render();
    a8PlasticEmitUpdated();


    return (
      a8PlasticSnapshot()
    );
  }


  /*
   * ==========================================================
   * DELETE
   * ==========================================================
   */

  function a8PlasticDeleteSelected() {

    const snapshot =
      a8PlasticSnapshot();


    if (!snapshot) {
      return null;
    }


    if (
      snapshot.layer ===
        'B'
    ) {

      const selectedEvent =
        a8PlasticBeatById(
          snapshot.id
        );


      const start =
        a8PlasticStartSlot(
          selectedEvent
        );


      const duration =
        a8PlasticDurationSlots(
          selectedEvent
        );


      a8BeatLayerB =
        a8BeatLayerB.filter(
          event =>
            event.hitId !==
              snapshot.id
        );


      /*
       * Same Ripple idea as A:
       * pull every later B hit earlier.
       */
      a8BeatLayerB.forEach(
        event => {

          const eventStart =
            a8PlasticStartSlot(
              event
            );


          if (
            eventStart >
              start
          ) {

            a8PlasticMoveEvent(
              event,
              Math.max(
                start,
                eventStart -
                duration
              )
            );
          }
        }
      );
    }


    if (
      snapshot.layer ===
        'C'
    ) {

      const group =
        a8PlasticChordGroup(
          snapshot.id
        );


      if (!group.length) {
        return null;
      }


      /*
       * C DELETE removes material only.
       *
       * Later C chords keep their native address.
       * The removed chord therefore leaves a real
       * empty interval.
       */
      a8ChordLayerC =
        a8ChordLayerC.filter(
          event =>
            event.chordInstanceId !==
              snapshot.id
        );


      a8PlasticPendingChordSlot =
        null;


      if (
        a8CPendingRestAnchor &&
        a8CPendingRestAnchor.id ===
          snapshot.id
      ) {
        a8CPendingRestAnchor =
          null;
      }


      showMessage(
        'LAYER C · CHORD DELETED · SPACE KEPT',
        true
      );
    }


    a8PlasticSelection =
      null;


    render();
    a8PlasticEmitUpdated();


    return null;
  }


  /*
   * ==========================================================
   * ADD NEXT
   * ==========================================================
   */

  function a8PlasticAddNext() {

    const snapshot =
      a8PlasticSnapshot();


    if (!snapshot) {
      throw new Error(
        'SELECT A BEAT OR CHORD'
      );
    }


    if (
      snapshot.layer ===
        'B'
    ) {

      const selected =
        a8PlasticBeatById(
          snapshot.id
        );


      const phrase =
        a8BeatLayerB.filter(
          event =>
            event.beatId ===
              selected.beatId
        );


      a8PlasticPendingBeatSlot =
        a8PlasticMaxEnd(
          phrase.length
            ? phrase
            : [
                selected
              ]
        );


      a8LayerOpenPreset(
        'B'
      );


      return;
    }


    if (
      snapshot.layer ===
        'C'
    ) {

      const group =
        a8PlasticChordGroup(
          snapshot.id
        );


      a8PlasticPendingChordSlot =
        a8PlasticEndSlot(
          group[0]
        );


      a8LayerOpenPreset(
        'C'
      );


      return;
    }
  }


  /*
   * ==========================================================
   * ROUTE EXISTING ARRANGER API TO SELECTED A/B/C OBJECT
   * ==========================================================
   */

  const a8PlasticApi =
    window.A8ComposerLabV1;


  if (!a8PlasticApi) {
    throw new Error(
      'A8 COMPOSER LAB API NOT FOUND'
    );
  }


  const a8PlasticBaseSelectedNote =
    a8PlasticApi
      .selectedNote
      .bind(
        a8PlasticApi
      );


  const a8PlasticBaseAdjustDuration =
    a8PlasticApi
      .adjustDuration
      .bind(
        a8PlasticApi
      );


  const a8PlasticBaseSetDuration =
    a8PlasticApi
      .setDuration
      .bind(
        a8PlasticApi
      );


  const a8PlasticBaseAdjustGain =
    a8PlasticApi
      .adjustGain
      .bind(
        a8PlasticApi
      );


  const a8PlasticBaseAdjustPitch =
    a8PlasticApi
      .adjustPitch
      .bind(
        a8PlasticApi
      );


  const a8PlasticBaseSetWaveform =
    a8PlasticApi
      .setWaveform
      .bind(
        a8PlasticApi
      );


  const a8PlasticBaseSetMotion =
    a8PlasticApi
      .setMotion
      .bind(
        a8PlasticApi
      );


  const a8PlasticBaseDeleteNote =
    a8PlasticApi
      .deleteNote
      .bind(
        a8PlasticApi
      );


  a8PlasticApi.selectedNote =
    function () {

      return (
        a8PlasticSelection
          ? a8PlasticSnapshot()
          : a8PlasticBaseSelectedNote()
      );
    };


  a8PlasticApi.adjustDuration =
    function (
      delta
    ) {

      if (!a8PlasticSelection) {
        return (
          a8PlasticBaseAdjustDuration(
            delta
          )
        );
      }


      if (
        a8PlasticSelection.layer ===
          'B'
      ) {
        return (
          a8PlasticAdjustBeatDuration(
            delta
          )
        );
      }


      return (
        a8PlasticAdjustChordDuration(
          delta
        )
      );
    };


  a8PlasticApi.setDuration =
    function (
      value
    ) {

      if (!a8PlasticSelection) {
        return (
          a8PlasticBaseSetDuration(
            value
          )
        );
      }


      if (
        a8PlasticSelection.layer ===
          'B'
      ) {
        return (
          a8PlasticSetBeatDuration(
            value
          )
        );
      }


      return (
        a8PlasticSetChordDuration(
          value
        )
      );
    };


  a8PlasticApi.adjustGain =
    function (
      delta
    ) {

      if (!a8PlasticSelection) {
        return (
          a8PlasticBaseAdjustGain(
            delta
          )
        );
      }


      return (
        a8PlasticAdjustGain(
          delta
        )
      );
    };


  a8PlasticApi.adjustPitch =
    function (
      delta
    ) {

      if (!a8PlasticSelection) {
        return (
          a8PlasticBaseAdjustPitch(
            delta
          )
        );
      }


      if (
        a8PlasticSelection.layer !==
          'B'
      ) {
        throw new Error(
          'CHORD PITCH COMES FROM CHORD CHOICE'
        );
      }


      return (
        a8PlasticAdjustBeatPitch(
          delta
        )
      );
    };


  a8PlasticApi.setWaveform =
    function (
      waveform
    ) {

      if (!a8PlasticSelection) {
        return (
          a8PlasticBaseSetWaveform(
            waveform
          )
        );
      }


      if (
        a8PlasticSelection.layer ===
          'B'
      ) {
        return (
          a8PlasticSetBeatWave(
            waveform
          )
        );
      }


      if (
        a8PlasticSelection.layer ===
          'C'
      ) {
        const group =
          a8PlasticChordGroup(
            a8PlasticSelection.id
          );

        if (
          group.length !== 3
        ) {
          throw new Error(
            'SELECT A COMPLETE CHORD'
          );
        }

        const parts =
          String(waveform || '')
            .trim()
            .toLowerCase()
            .split('+')
            .map(part => part.trim())
            .filter(Boolean);

        const allowed =
          new Set([
            'sine',
            'triangle',
            'square',
            'sawtooth'
          ]);

        if (
          !parts.length ||
          parts.some(part => !allowed.has(part))
        ) {
          throw new Error('INVALID VOICE');
        }

        const voice = parts.join('+');

        group.forEach(event => {
          event.waveform = voice;
        });

        render();
        a8PlasticEmitUpdated();
        return a8PlasticSnapshot();
      }


      throw new Error(
        'SELECT A NOTE, BEAT OR CHORD'
      );
    };


  a8PlasticApi.setMotion =
    function (
      motion
    ) {

      if (!a8PlasticSelection) {
        return (
          a8PlasticBaseSetMotion(
            motion
          )
        );
      }


      if (
        a8PlasticSelection.layer !==
          'B'
      ) {
        throw new Error(
          'SELECT A BEAT FOR MOTION CHANGE'
        );
      }


      return (
        a8PlasticSetBeatMotion(
          motion
        )
      );
    };


  a8PlasticApi.deleteNote =
    function () {

      if (!a8PlasticSelection) {
        return (
          a8PlasticBaseDeleteNote()
        );
      }


      return (
        a8PlasticDeleteSelected()
      );
    };


  a8PlasticApi.a8PlasticAddNext =
    a8PlasticAddNext;


  /*
   * ==========================================================
   * RENDER B/C AS CLICKABLE OBJECTS
   * ==========================================================
   */

  const a8PlasticBaseRenderABC =
    a8LayerRenderABC;


  a8LayerRenderABC =
    function () {

      a8PlasticBaseRenderABC();

      a8PlasticEnsureIds();


      const card =
        document.querySelector(
          '.bar-card.active'
        );


      if (!card) {
        return;
      }


      const barNumber =
        a8LayerActiveBarNumber();


      const barStart =
        (
          barNumber -
          1
        ) *
        BAR_SLOTS;


      const barEnd =
        barStart +
        BAR_SLOTS;


      /*
       * --------------------------
       * B TRACK
       * --------------------------
       */

      const rowB =
        card.querySelector(
          '.a8-layer-b'
        );


      if (rowB) {

        rowB
          .querySelectorAll(
            '.a8-layer-controls'
          )
          .forEach(
            node =>
              node.remove()
          );


        const track =
          rowB.querySelector(
            '.a8-layer-track'
          );


        if (track) {

          track.replaceChildren();


          const hits =
            a8BeatLayerB
              .filter(
                event => {

                  const start =
                    a8PlasticStartSlot(
                      event
                    );


                  const end =
                    a8PlasticEndSlot(
                      event
                    );


                  return (
                    start <
                      barEnd &&
                    end >
                      barStart
                  );
                }
              )
              .sort(
                (
                  left,
                  right
                ) =>
                  a8PlasticStartSlot(
                    left
                  ) -
                  a8PlasticStartSlot(
                    right
                  )
              );


          if (!hits.length) {

            const add =
              a8LayerButton(
                '+ ADD BEAT',
                'open-b'
              );


            add.classList.add(
              'a8-layer-empty'
            );


            track.appendChild(
              add
            );

          } else {

            hits.forEach(
              event => {

                const start =
                  Math.max(
                    barStart,
                    a8PlasticStartSlot(
                      event
                    )
                  );


                const end =
                  Math.min(
                    barEnd,
                    a8PlasticEndSlot(
                      event
                    )
                  );


                const button =
                  document.createElement(
                    'button'
                  );


                button.type =
                  'button';


                button.className =
                  'a8-layer-hit';


                button.dataset
                  .a8PlasticBeat =
                    event.hitId;

                button.draggable = false;
                button.style.touchAction = 'none';
                button.title = 'DRAG WITHIN BAR · ' + String(event.label || 'BEAT');


                button.style.gridColumn =
                  (
                    (
                      start -
                      barStart
                    ) +
                    1
                  ) +
                  ' / span ' +
                  Math.max(
                    1,
                    end -
                    start
                  );


                const pieces =
                  String(
                    event.label ||
                    'BEAT'
                  )
                    .split(
                      '·'
                    );


                button.textContent =
                  pieces[
                    pieces.length -
                    1
                  ]
                    .trim()
                    .slice(
                      0,
                      4
                    );


                button.title =
                  'CLICK TO ADJUST · ' +
                  String(
                    event.label ||
                    'BEAT'
                  );


                track.appendChild(
                  button
                );
              }
            );
          }
        }
      }


      /*
       * --------------------------
       * C TRACK
       * --------------------------
       */

      const rowC =
        card.querySelector(
          '.a8-layer-c'
        );


      if (rowC) {

        rowC
          .querySelectorAll(
            '.a8-layer-controls'
          )
          .forEach(
            node =>
              node.remove()
          );


        const track =
          rowC.querySelector(
            '.a8-layer-track'
          );


        if (track) {

          track.replaceChildren();


          const groups =
            a8PlasticChordGroups()
              .filter(
                group => {

                  const start =
                    a8PlasticStartSlot(
                      group[0]
                    );


                  const end =
                    a8PlasticEndSlot(
                      group[0]
                    );


                  return (
                    start <
                      barEnd &&
                    end >
                      barStart
                  );
                }
              );


          if (!groups.length) {

            const add =
              a8LayerButton(
                '+ ADD CHORD',
                'open-c'
              );


            add.classList.add(
              'a8-layer-empty'
            );


            track.appendChild(
              add
            );

          } else {

            groups.forEach(
              group => {

                const first =
                  group[0];


                const start =
                  Math.max(
                    barStart,
                    a8PlasticStartSlot(
                      first
                    )
                  );


                const end =
                  Math.min(
                    barEnd,
                    a8PlasticEndSlot(
                      first
                    )
                  );


                const button =
                  document.createElement(
                    'button'
                  );


                button.type =
                  'button';


                button.className =
                  'a8-layer-chord-chip';


                button.dataset
                  .a8PlasticChord =
                    first
                      .chordInstanceId;

                button.draggable = false;
                button.style.touchAction = 'none';
                button.title = 'DRAG CHORD WITHIN BAR · ' + String(first.chordLabel || 'CHORD');


                button.style.gridColumn =
                  (
                    (
                      start -
                      barStart
                    ) +
                    1
                  ) +
                  ' / span ' +
                  Math.max(
                    1,
                    end -
                    start
                  );


                button.textContent =
                  first.chordLabel;


                button.title =
                  'CLICK TO ADJUST · ' +
                  first.chordLabel;


                track.appendChild(
                  button
                );
              }
            );
          }
        }
      }


      /*
       * One simple instruction.
       * No permanent control forest below B/C.
       */

      const footer =
        card.querySelector(
          '.bar-footer'
        );


      if (
        footer &&
        !card.querySelector(
          '.a8-plastic-hint'
        )
      ) {

        const hint =
          document.createElement(
            'div'
          );


        hint.className =
          'sub a8-plastic-hint';


        hint.textContent =
          'CLICK NOTE · BEAT · OR CHORD TO ADJUST';


        card.insertBefore(
          hint,
          footer
        );
      }
    };


  /*
   * ==========================================================
   * CLICK ROUTING
   * ==========================================================
   */

  const a8PlasticBarsHost =
    document.getElementById(
      'bars'
    );


  /* V5 · native-duration reorder for B/C; one shared mouse/touch path. */
  let a8BCDrag = null;
  let a8BCPointer = null;
  let a8BCSuppressClick = false;
  const a8BCTrackSelector = '.a8-layer-b .a8-layer-track, .a8-layer-c .a8-layer-track';

  function a8BCChip(node) {
    return node?.closest?.('[data-a8-plastic-beat], [data-a8-plastic-chord]') || null;
  }

  function a8BCIdentify(chip) {
    if (!chip) return null;
    const layer = chip.hasAttribute('data-a8-plastic-beat') ? 'B' : 'C';
    const id = layer === 'B' ? chip.dataset.a8PlasticBeat : chip.dataset.a8PlasticChord;
    return id ? {layer, id} : null;
  }

  function a8BCObjects(layer) {
    return layer === 'B'
      ? a8BeatLayerB.map(hit => ({id: hit.hitId, group: [hit]}))
      : a8PlasticChordGroups().map(group => ({id: group[0].chordInstanceId, group}));
  }

  function a8BCReorder(drag, target) {
    if (!drag || !target || drag.layer !== target.layer) return false;
    if (drag.id === target.id) return true;
    const objects = a8BCObjects(drag.layer);
    const source = objects.find(item => item.id === drag.id);
    const dest = objects.find(item => item.id === target.id);
    if (!source || !dest) return false;
    const from = a8PlasticStartSlot(source.group[0]);
    const to = a8PlasticStartSlot(dest.group[0]);
    const bar = Math.floor(from / BAR_SLOTS);
    if (Math.floor(to / BAR_SLOTS) !== bar) return false;
    const low = bar * BAR_SLOTS;
    const high = low + BAR_SLOTS;
    const row = objects.filter(item => {
      const start = a8PlasticStartSlot(item.group[0]);
      const end = a8PlasticEndSlot(item.group[0]);
      return start < high && end > low;
    }).sort((x,y) => a8PlasticStartSlot(x.group[0]) - a8PlasticStartSlot(y.group[0]));
    // The individual chord tones must be aligned and of identical duration.
    for (const item of row) {
      const first = item.group[0];
      const start = a8PlasticStartSlot(first);
      const end = a8PlasticEndSlot(first);
      if (start < low || end > high || end <= start ||
          item.group.some(t => a8PlasticStartSlot(t) !== start || a8PlasticEndSlot(t) !== end)) return false;
    }
    // Pre-existing overlaps/stacks are intentionally not rewritten.
    for (let i=1; i<row.length; i++) {
      if (a8PlasticStartSlot(row[i].group[0]) < a8PlasticEndSlot(row[i-1].group[0])) return false;
    }
    const left = row.findIndex(item => item.id === drag.id);
    const right = row.findIndex(item => item.id === target.id);
    if (left < 0 || right < 0) return false;
    // Keep original gaps attached to timeline boundaries while moving objects.
    const starts = row.map(item => a8PlasticStartSlot(item.group[0]));
    const durations = row.map(item => a8PlasticDurationSlots(item.group[0]));
    const gaps = starts.map((start,i) => i === 0 ? start-low : start-(starts[i-1]+durations[i-1]));
    if (gaps.some(g=>g<0)) return false;
    const reordered = row.slice();
    const [moving] = reordered.splice(left, 1);
    reordered.splice(right, 0, moving);
    let cursor = low;
    const placement = [];
    for (let i=0; i<reordered.length; i++) {
      cursor += gaps[i];
      const duration = a8PlasticDurationSlots(reordered[i].group[0]);
      if (cursor + duration > high) return false;
      placement.push([reordered[i], cursor]);
      cursor += duration;
    }
    // Atomic commit after checking all native positions.
    for (const [item, start] of placement) {
      item.group.forEach(tone => a8PlasticMoveEvent(tone, start));
    }
    if (drag.layer === 'B') a8PlasticSelectBeat(drag.id);
    else a8PlasticSelectChord(drag.id);
    render();
    a8PlasticEmitUpdated();
    return true;
  }

  function a8BCFinish(drag, atNode) {
    const chip = a8BCChip(atNode);
    const target = a8BCIdentify(chip);
    const row = chip?.closest?.(a8BCTrackSelector);
    if (!target || !row || target.layer !== drag.layer ||
        Math.floor(a8PlasticStartSlot(a8BCObjects(target.layer).find(o=>o.id===target.id).group[0]) / BAR_SLOTS) !== drag.bar ||
        !a8BCReorder(drag,target)) {
      showMessage('B/C REORDER · SAME BAR · NON-OVERLAPPING EVENTS ONLY', false);
    }
  }

  if (a8PlasticBarsHost) {
    // V6: a single pointer gesture path; native HTML drag is disabled on B/C chips.
    // We suppress the synthesized click globally in capture, before older
    // document-level click handlers can launch the options editor.
    let suppressUntil = 0;
    document.addEventListener('click', event => {
      if (performance.now() > suppressUntil) return;
      suppressUntil = 0;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);

    a8PlasticBarsHost.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.isPrimary) return;
      const chip = a8BCChip(event.target);
      const info = a8BCIdentify(chip);
      if (!info || !chip.closest(a8BCTrackSelector)) return;
      const item = a8BCObjects(info.layer).find(o => o.id === info.id);
      if (!item) return;
      const start = a8PlasticStartSlot(item.group[0]);
      a8BCPointer = {...info, bar: Math.floor(start/BAR_SLOTS),
        pointerId: event.pointerId, chip,
        x: event.clientX, y: event.clientY, moved: false};
      // Keep receiving moves when the finger leaves the chip.
      try { chip.setPointerCapture(event.pointerId); } catch (_) {}
    }, true);

    a8PlasticBarsHost.addEventListener('pointermove', event => {
      const drag = a8BCPointer;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX-drag.x, event.clientY-drag.y) < 8) return;
      drag.moved = true;
      if (event.cancelable) event.preventDefault();
    }, {capture:true, passive:false});

    a8PlasticBarsHost.addEventListener('pointerup', event => {
      const drag = a8BCPointer;
      if (!drag || drag.pointerId !== event.pointerId) return;
      a8BCPointer = null;
      if (!drag.moved) return; // a normal tap still opens options
      // Suppress the browser's synthetic click, even if render() replaces
      // the original chip before the click event is dispatched.
      suppressUntil = performance.now() + 500;
      event.preventDefault();
      event.stopImmediatePropagation();
      const below = document.elementFromPoint(event.clientX,event.clientY);
      a8BCFinish(drag, below);
    }, true);
    a8PlasticBarsHost.addEventListener('pointercancel', event => {
      if (a8BCPointer?.pointerId === event.pointerId) a8BCPointer = null;
    }, true);
    // Prevent native dragstart from the descendants of chip buttons.
    a8PlasticBarsHost.addEventListener('dragstart', event => {
      if (a8BCChip(event.target)) event.preventDefault();
    }, true);
  }

  if (a8PlasticBarsHost) {

    a8PlasticBarsHost.addEventListener(
      'click',
      event => {

        const beat =
          event.target.closest(
            '[data-a8-plastic-beat]'
          );


        if (beat) {

          event.preventDefault();
          event.stopImmediatePropagation();


          a8PlasticSelectBeat(
            beat.dataset
              .a8PlasticBeat
          );


          return;
        }


        const chord =
          event.target.closest(
            '[data-a8-plastic-chord]'
          );


        if (chord) {

          event.preventDefault();
          event.stopImmediatePropagation();


          a8PlasticSelectChord(
            chord.dataset
              .a8PlasticChord
          );


          return;
        }


        /*
         * A selection returns authority to A.
         */
        if (
          event.target.closest(
            '.score-chip'
          )
        ) {
          a8PlasticSelection =
            null;
        }


        /*
         * Empty B/C lane:
         * preset chooser creates new editable material.
         */
        if (
          event.target.closest(
            '[data-a8-layer-action="open-b"]'
          )
        ) {
          a8PlasticSelection =
            null;

          a8PlasticPendingBeatSlot =
            null;
        }


        if (
          event.target.closest(
            '[data-a8-layer-action="open-c"]'
          )
        ) {
          a8PlasticSelection =
            null;

          a8PlasticPendingChordSlot =
            null;
        }
      },
      true
    );
  }


  /*
   * First-pass fixed-bar clear button is no longer
   * part of the interaction.
   */

  const a8PlasticOldChordClear =
    document.getElementById(
      'a8ChordClearActiveBar'
    );


  if (a8PlasticOldChordClear) {
    a8PlasticOldChordClear.hidden =
      true;
  }


  render();

  /* A8-PLASTIC-ARDILLA-ABC-V2-END */



  /* A8-UNIVERSAL-ADD-NEXT-V3-BEGIN */

  /*
   * ==========================================================
   * UNIVERSAL ADD NEXT
   * ==========================================================
   *
   * Selection answers:
   *
   *   WHAT AM I EDITING?
   *
   * ADD NEXT answers:
   *
   *   WHICH LANE GETS NEW MATERIAL?
   *
   * Therefore the four routes are permanent:
   *
   *   A NOTE
   *   A REST
   *   B BEAT
   *   C CHORD
   *
   * They do not depend on whether the selected object is
   * currently a note, rest, beat or chord.
   */


  function a8UniversalAppendALogical(
    event
  ) {

    const sequence =
      a8RippleSequence();


    const key =
      a8RippleNewKey();


    const logical = {
      key,

      event:
        a8RippleStripTie(
          event
        ),

      slots:
        slotsForDuration(
          event.durationA8
        ),

      preferredTieId:
        null
    };


    /*
     * Lane A append means END OF A.
     * It does not mean after the currently selected B/C object.
     */
    sequence.push(
      logical
    );


    a8PlasticSelection =
      null;


    a8RippleReflow(
      sequence,
      key
    );


    return (
      a8LabSnapshot()
    );
  }


  function a8UniversalAppendNote(
    noteName,
    octaveShift
  ) {

    const name =
      String(
        noteName ||
        ''
      ).trim();


    const shift =
      Number(
        octaveShift
      );


    if (
      !Number.isInteger(
        shift
      ) ||
      shift < -2 ||
      shift > 2
    ) {
      throw new Error(
        'OCTAVE MUST BE -2 THROUGH +2'
      );
    }


    /*
     * Validates native note identity.
     */
    noteReferencePitch(
      name
    );


    const event =
      makeNote({
        type:
          'note',

        noteName:
          name,

        octaveShift:
          shift,

        pitch:
          pitchForOctave(
            name,
            shift
          )
      });


    const result =
      a8UniversalAppendALogical(
        event
      );


    showMessage(
      name +
      ' · ' +
      octaveText(
        shift
      ) +
      ' · ADDED TO END OF A',
      true
    );


    return result;
  }


  function a8UniversalAppendRest() {

    /*
     * Use Composer's current native working duration.
     * No B/C object supplies REST timing.
     */
    const rest =
      makeRest();


    const result =
      a8UniversalAppendALogical(
        rest
      );


    showMessage(
      rest.durationA8 +
      ' A8s REST · ADDED TO END OF A',
      true
    );


    return result;
  }


  function a8UniversalSelectedAEndSlot() {

    const sequence =
      a8RippleSequence();


    const selectedKey =
      a8RippleSelectedKey(
        sequence
      );


    if (!selectedKey) {
      throw new Error(
        'SELECT AN A NOTE OR REST FIRST'
      );
    }


    let cursor =
      0;


    for (
      const logical
      of sequence
    ) {

      cursor +=
        logical.slots;


      if (
        logical.key ===
          selectedKey
      ) {
        return cursor;
      }
    }


    throw new Error(
      'SELECTED A EVENT NOT FOUND'
    );
  }


  function a8UniversalOpenAppend(
    layer,
    afterSelectedA =
      false
  ) {

    const anchorSlot =
      afterSelectedA
        ? a8UniversalSelectedAEndSlot()
        : null;


    if (
      layer ===
        'B'
    ) {

      /*
       * From an A popup:
       * begin directly after selected A event.
       *
       * From another popup:
       * retain existing end-of-B behavior.
       */
      a8PlasticPendingBeatSlot =
        afterSelectedA
          ? anchorSlot
          : a8PlasticMaxEnd(
              a8BeatLayerB
            );


      a8LayerOpenPreset(
        'B'
      );


      return;
    }


    if (
      layer ===
        'C'
    ) {

      /*
       * From an A popup:
       * begin directly after selected A event.
       *
       * From another popup:
       * retain existing end-of-C behavior.
       */
      a8PlasticPendingChordSlot =
        afterSelectedA
          ? anchorSlot
          : a8PlasticMaxEnd(
              a8ChordLayerC
            );


      a8LayerOpenPreset(
        'C'
      );


      return;
    }


    throw new Error(
      'UNIVERSAL ADD NEXT LAYER MUST BE B OR C'
    );
  }


  /*
   * Public Composer lab routes used by the single popup.
   */

  if (
    !window.A8ComposerLabV1
  ) {
    throw new Error(
      'A8 COMPOSER LAB API NOT FOUND'
    );
  }


  window.A8ComposerLabV1
    .a8UniversalAppendNote =
      a8UniversalAppendNote;


  window.A8ComposerLabV1
    .a8UniversalAppendRest =
      a8UniversalAppendRest;


  window.A8ComposerLabV1
    .a8UniversalOpenAppend =
      a8UniversalOpenAppend;

  /* A8-UNIVERSAL-ADD-NEXT-V3-END */




  /* A8-C-REST-GAP-V1-BEGIN */

  /*
   * LAYER C REST
   *
   * C REST = empty accompaniment time.
   *
   * No A REST is created.
   * No fake silent chord is created.
   *
   * One click:
   *   1 A8s = 16 native slots
   *
   * inserted immediately after selected C chord.
   */


  let a8CPendingRestAnchor =
    null;


  function a8UniversalInsertCRest(
    slots =
      16
  ) {

    const amount =
      Number(
        slots
      );


    if (
      !Number.isInteger(
        amount
      ) ||
      amount <
        1
    ) {
      throw new Error(
        'C REST REQUIRES POSITIVE NATIVE SLOTS'
      );
    }


    const snapshot =
      a8PlasticSnapshot();


    if (
      !snapshot ||
      snapshot.layer !==
        'C'
    ) {
      throw new Error(
        'SELECT A C CHORD'
      );
    }


    const group =
      a8PlasticChordGroup(
        snapshot.id
      );


    if (!group.length) {
      throw new Error(
        'SELECTED C CHORD NOT FOUND'
      );
    }


    const end =
      a8PlasticEndSlot(
        group[0]
      );


    /*
     * Create empty C time by moving every later
     * C logical chord forward.
     */
    a8ChordLayerC.forEach(
      event => {

        if (
          event.chordInstanceId ===
            snapshot.id
        ) {
          return;
        }


        const start =
          a8PlasticStartSlot(
            event
          );


        if (
          start >=
            end
        ) {

          a8PlasticMoveEvent(
            event,
            start +
            amount
          );
        }
      }
    );


    /*
     * Repeated C REST clicks accumulate after
     * this same selected chord.
     */
    if (
      a8CPendingRestAnchor &&
      a8CPendingRestAnchor.id ===
        snapshot.id
    ) {

      a8CPendingRestAnchor.slot +=
        amount;

    } else {

      a8CPendingRestAnchor = {
        id:
          snapshot.id,

        slot:
          end +
          amount
      };
    }


    a8PlasticEnsureBars(
      Math.max(
        a8PlasticMaxEnd(
          a8ChordLayerC
        ),
        a8CPendingRestAnchor.slot
      )
    );


    render();
    a8PlasticEmitUpdated();


    showMessage(
      'LAYER C · REST 1 A8s ADDED NEXT',
      true
    );


    return (
      a8PlasticSnapshot()
    );
  }


  function a8UniversalOpenAfterSelectedC() {

    const snapshot =
      a8PlasticSnapshot();


    if (
      !snapshot ||
      snapshot.layer !==
        'C'
    ) {
      throw new Error(
        'SELECT A C CHORD'
      );
    }


    const group =
      a8PlasticChordGroup(
        snapshot.id
      );


    if (!group.length) {
      throw new Error(
        'SELECTED C CHORD NOT FOUND'
      );
    }


    a8PlasticPendingChordSlot =
      (
        a8CPendingRestAnchor &&
        a8CPendingRestAnchor.id ===
          snapshot.id
      )
        ? a8CPendingRestAnchor.slot
        : a8PlasticEndSlot(
            group[0]
          );


    a8CPendingRestAnchor =
      null;


    a8LayerOpenPreset(
      'C'
    );
  }


  if (
    !window.A8ComposerLabV1
  ) {
    throw new Error(
      'A8 COMPOSER LAB API NOT FOUND'
    );
  }


  window.A8ComposerLabV1
    .a8UniversalInsertCRest =
      a8UniversalInsertCRest;


  window.A8ComposerLabV1
    .a8UniversalOpenAfterSelectedC =
      a8UniversalOpenAfterSelectedC;

  /* A8-C-REST-GAP-V1-END */



  /* A8-DELETE-LAST-INPUT-V1-BEGIN */

  /*
   * One creation-level emergency backspace.
   *
   * The complete native score is captured before
   * the newest input is created.
   *
   * Inputs covered:
   *
   *   A NOTE
   *   A REST
   *   B BEAT / PHRASE
   *   C CHORD
   *   C REST
   *
   * This is one level only.
   */


  let a8LastInputUndo =
    null;


  let a8LastInputDepth =
    0;


  let a8LastInputRestoring =
    false;


  function a8LastInputClone(
    value
  ) {

    return (
      JSON.parse(
        JSON.stringify(
          value
        )
      )
    );
  }


  function a8LastInputEmit() {

    window.dispatchEvent(
      new CustomEvent(
        'a8-last-input-state',
        {
          detail:
            a8LastInputUndo
              ? {
                  available:
                    true,

                  label:
                    a8LastInputUndo.label
                }
              : {
                  available:
                    false,

                  label:
                    null
                }
        }
      )
    );
  }


  function a8WithLastInput(
    label,
    callback
  ) {

    /*
     * Nested creation routes are one user input.
     */
    if (
      a8LastInputDepth >
        0
    ) {
      return (
        callback()
      );
    }


    const before =
      a8LastInputClone(
        saveScore()
      );


    a8LastInputDepth +=
      1;


    try {

      const result =
        callback();


      a8LastInputUndo = {
        label:
          String(
            label
          ),

        score:
          before
      };


      a8LastInputEmit();


      return result;

    } finally {

      a8LastInputDepth -=
        1;
    }
  }


  /*
   * Opening another score invalidates the old
   * one-step creation backspace.
   */
  const a8LastInputBaseImportScore =
    importScore;


  importScore =
    function (
      score
    ) {

      const result =
        a8LastInputBaseImportScore(
          score
        );


      if (!a8LastInputRestoring) {

        a8LastInputUndo =
          null;


        a8LastInputEmit();
      }


      return result;
    };


  function a8WrapLastInputApi(
    name,
    label
  ) {

    const api =
      window.A8ComposerLabV1;


    if (
      !api ||
      typeof api[
        name
      ] !==
        'function'
    ) {
      return;
    }


    const original =
      api[
        name
      ].bind(
        api
      );


    api[
      name
    ] =
      function (
        ...args
      ) {

        return (
          a8WithLastInput(
            label,
            () =>
              original(
                ...args
              )
          )
        );
      };
  }


  /*
   * Layer A creation.
   */
  a8WrapLastInputApi(
    'insertNote',
    'A NOTE'
  );


  a8WrapLastInputApi(
    'insertNoteAfterSelected',
    'A NOTE'
  );


  a8WrapLastInputApi(
    'insertRest',
    'A REST'
  );


  a8WrapLastInputApi(
    'insertRestAfterSelected',
    'A REST'
  );


  a8WrapLastInputApi(
    'a8UniversalAppendNote',
    'A NOTE'
  );


  a8WrapLastInputApi(
    'a8UniversalAppendRest',
    'A REST'
  );


  /*
   * Layer C empty interval.
   */
  a8WrapLastInputApi(
    'a8UniversalInsertCRest',
    'C REST'
  );


  /*
   * Layer B mould -> working material.
   */
  const a8LastInputBaseBeatInstall =
    a8BeatInstallPreset;


  a8BeatInstallPreset =
    function (
      score
    ) {

      return (
        a8WithLastInput(
          'B BEAT',
          () =>
            a8LastInputBaseBeatInstall(
              score
            )
        )
      );
    };


  /*
   * Layer C mould -> working chord.
   */
  const a8LastInputBaseChordInstall =
    a8ChordInstallPreset;


  a8ChordInstallPreset =
    function (
      preset
    ) {

      return (
        a8WithLastInput(
          'C CHORD',
          () =>
            a8LastInputBaseChordInstall(
              preset
            )
        )
      );
    };


  function a8DeleteLastInput() {

    if (!a8LastInputUndo) {
      throw new Error(
        'NO NEW INPUT TO DELETE'
      );
    }


    const record =
      a8LastInputUndo;


    const restore =
      a8LastInputClone(
        record.score
      );


    /*
     * One level only.
     */
    a8LastInputUndo =
      null;


    a8LastInputRestoring =
      true;


    try {

      importScore(
        restore
      );

    } finally {

      a8LastInputRestoring =
        false;
    }


    a8PlasticSelection =
      null;


    a8PlasticPendingBeatSlot =
      null;


    a8PlasticPendingChordSlot =
      null;


    a8CPendingRestAnchor =
      null;


    render();


    showMessage(
      'DELETED LAST INPUT · ' +
      record.label,
      true
    );


    a8LastInputEmit();


    window.dispatchEvent(
      new CustomEvent(
        'a8-last-input-restored',
        {
          detail: {
            label:
              record.label
          }
        }
      )
    );


    return (
      a8LabSnapshot()
    );
  }


  if (
    !window.A8ComposerLabV1
  ) {
    throw new Error(
      'A8 COMPOSER LAB API NOT FOUND'
    );
  }


  window.A8ComposerLabV1
    .a8DeleteLastInput =
      a8DeleteLastInput;

  /* A8-DELETE-LAST-INPUT-V1-END */



  /* A8-UNIVERSAL-SILENCE-V1-BEGIN */

  /*
   * ==========================================================
   * UNIVERSAL SILENCE
   * ==========================================================
   *
   * A:
   *   explicit REST is already timed silence.
   *
   * B / C:
   *   silence is the actual empty native interval
   *   between occupied material.
   *
   * No fake beat hit.
   * No fake chord.
   * No silent sound event.
   */


  let a8SilenceSelection =
    null;


  function a8SilenceLaneEvents(
    layer
  ) {

    if (
      layer ===
        'B'
    ) {
      return (
        a8BeatLayerB
      );
    }


    if (
      layer ===
        'C'
    ) {
      return (
        a8ChordLayerC
      );
    }


    throw new Error(
      'SILENCE LAYER MUST BE B OR C'
    );
  }


  function a8SilenceOccupiedRanges(
    layer
  ) {

    let ranges;


    if (
      layer ===
        'B'
    ) {

      ranges =
        a8BeatLayerB.map(
          event => ({
            start:
              a8PlasticStartSlot(
                event
              ),

            end:
              a8PlasticEndSlot(
                event
              )
          })
        );

    } else if (
      layer ===
        'C'
    ) {

      ranges =
        a8PlasticChordGroups()
          .map(
            group => ({
              start:
                a8PlasticStartSlot(
                  group[0]
                ),

              end:
                a8PlasticEndSlot(
                  group[0]
                )
            })
          );

    } else {

      throw new Error(
        'SILENCE LAYER MUST BE B OR C'
      );
    }


    ranges.sort(
      (
        left,
        right
      ) =>
        left.start -
        right.start ||
        left.end -
        right.end
    );


    const merged =
      [];


    ranges.forEach(
      range => {

        if (
          range.end <=
            range.start
        ) {
          return;
        }


        const last =
          merged[
            merged.length -
            1
          ];


        if (
          !last ||
          range.start >
            last.end
        ) {

          merged.push({
            start:
              range.start,

            end:
              range.end
          });


          return;
        }


        last.end =
          Math.max(
            last.end,
            range.end
          );
      }
    );


    return merged;
  }


  function a8SilenceGaps(
    layer
  ) {

    const ranges =
      a8SilenceOccupiedRanges(
        layer
      );


    const gaps =
      [];


    for (
      let index = 0;
      index <
        ranges.length -
        1;
      index += 1
    ) {

      const left =
        ranges[
          index
        ];


      const right =
        ranges[
          index +
          1
        ];


      if (
        right.start >
          left.end
      ) {

        gaps.push({
          layer,

          start:
            left.end,

          end:
            right.start
        });
      }
    }


    return gaps;
  }


  function a8SilenceSnapshot() {

    if (
      !a8SilenceSelection
    ) {
      return null;
    }


    const slots =
      a8SilenceSelection.end -
      a8SilenceSelection.start;


    return {
      id:
        'SILENCE-' +
        a8SilenceSelection.layer +
        '-' +
        a8SilenceSelection.start +
        '-' +
        a8SilenceSelection.end,

      type:
        'rest',

      objectKind:
        'SILENCE',

      layer:
        a8SilenceSelection.layer,

      label:
        'SILENCE',

      startA8:
        a8ForSlots(
          a8SilenceSelection.start
        ),

      durationA8:
        a8ForSlots(
          slots
        ),

      endA8:
        a8ForSlots(
          a8SilenceSelection.end
        ),

      startSlot:
        a8SilenceSelection.start,

      durationSlots:
        slots,

      endSlot:
        a8SilenceSelection.end
    };
  }


  function a8SilenceEmit() {

    const snapshot =
      a8SilenceSnapshot();


    if (!snapshot) {
      return;
    }


    window.dispatchEvent(
      new CustomEvent(
        'a8-arranger-silence-selected',
        {
          detail:
            snapshot
        }
      )
    );
  }


  function a8SilenceClear() {

    a8SilenceSelection =
      null;
  }


  function a8SilenceSelect(
    layer,
    start,
    end
  ) {

    const wantedStart =
      Number(
        start
      );


    const wantedEnd =
      Number(
        end
      );


    const gap =
      a8SilenceGaps(
        layer
      ).find(
        candidate =>
          candidate.start ===
            wantedStart &&
          candidate.end ===
            wantedEnd
      );


    if (!gap) {
      throw new Error(
        'SILENCE FIELD NO LONGER EXISTS'
      );
    }


    a8PlasticSelection =
      null;


    a8SilenceSelection = {
      layer:
        gap.layer,

      start:
        gap.start,

      end:
        gap.end
    };


    a8SilenceEmit();


    return (
      a8SilenceSnapshot()
    );
  }


  function a8SilenceShiftLater(
    layer,
    fromSlot,
    delta
  ) {

    const amount =
      Number(
        delta
      );


    a8SilenceLaneEvents(
      layer
    ).forEach(
      event => {

        const start =
          a8PlasticStartSlot(
            event
          );


        if (
          start >=
            fromSlot
        ) {

          a8PlasticMoveEvent(
            event,
            start +
              amount
          );
        }
      }
    );
  }


  function a8SilenceLaneMaxEnd(
    layer
  ) {

    return (
      a8SilenceLaneEvents(
        layer
      ).reduce(
        (
          current,
          event
        ) =>
          Math.max(
            current,
            a8PlasticEndSlot(
              event
            )
          ),
        0
      )
    );
  }


  function a8SilenceAdjust(
    delta
  ) {

    if (
      !a8SilenceSelection
    ) {
      throw new Error(
        'SELECT SILENCE'
      );
    }


    const amount =
      Number(
        delta
      );


    if (
      !Number.isInteger(
        amount
      )
    ) {
      throw new Error(
        'SILENCE CHANGE MUST USE NATIVE SLOTS'
      );
    }


    const current = {
      ...a8SilenceSelection
    };


    const oldSlots =
      current.end -
      current.start;


    const nextSlots =
      oldSlots +
      amount;


    if (
      nextSlots <
        0
    ) {
      throw new Error(
        'SILENCE CANNOT BE NEGATIVE'
      );
    }


    if (
      amount !==
        0
    ) {

      a8SilenceShiftLater(
        current.layer,
        current.end,
        amount
      );
    }


    if (
      current.layer ===
        'C'
    ) {

      a8CPendingRestAnchor =
        null;
    }


    if (
      nextSlots ===
        0
    ) {

      a8SilenceSelection =
        null;


      render();


      window.dispatchEvent(
        new CustomEvent(
          'a8-arranger-silence-deleted'
        )
      );


      showMessage(
        'SILENCE · 0 · MATERIAL TOUCHES',
        true
      );


      return null;
    }


    a8SilenceSelection = {
      layer:
        current.layer,

      start:
        current.start,

      end:
        current.start +
        nextSlots
    };


    a8PlasticEnsureBars(
      a8SilenceLaneMaxEnd(
        current.layer
      )
    );


    render();


    a8SilenceEmit();


    showMessage(
      'SILENCE · ' +
      a8ForSlots(
        nextSlots
      ) +
      ' A8s',
      true
    );


    return (
      a8SilenceSnapshot()
    );
  }


  function a8SilenceSetDuration(
    value
  ) {

    if (
      !a8SilenceSelection
    ) {
      throw new Error(
        'SELECT SILENCE'
      );
    }


    const targetSlots =
      slotsForDuration(
        String(
          value
        )
      );


    const currentSlots =
      a8SilenceSelection.end -
      a8SilenceSelection.start;


    return (
      a8SilenceAdjust(
        targetSlots -
        currentSlots
      )
    );
  }


  function a8SilenceDelete() {

    if (
      !a8SilenceSelection
    ) {
      throw new Error(
        'SELECT SILENCE'
      );
    }


    const slots =
      a8SilenceSelection.end -
      a8SilenceSelection.start;


    return (
      a8SilenceAdjust(
        -slots
      )
    );
  }


  function a8SilenceCreateAfterSelected(
    layer,
    slots =
      16
  ) {

    const amount =
      Number(
        slots
      );


    if (
      !Number.isInteger(
        amount
      ) ||
      amount <
        1
    ) {
      throw new Error(
        'SILENCE MUST BE POSITIVE NATIVE TIME'
      );
    }


    /*
     * If SILENCE itself is selected,
     * SILENCE means increase this same field.
     */
    if (
      a8SilenceSelection &&
      a8SilenceSelection.layer ===
        layer
    ) {

      return (
        a8SilenceAdjust(
          amount
        )
      );
    }


    if (
      !a8PlasticSelection ||
      a8PlasticSelection.layer !==
        layer
    ) {
      throw new Error(
        'SELECT ' +
        layer +
        ' MATERIAL'
      );
    }


    const ranges =
      a8SilenceOccupiedRanges(
        layer
      );


    let selectedStart;
    let selectedEnd;


    if (
      layer ===
        'B'
    ) {

      const selected =
        a8PlasticBeatById(
          a8PlasticSelection.id
        );


      if (!selected) {
        throw new Error(
          'SELECTED BEAT NOT FOUND'
        );
      }


      selectedStart =
        a8PlasticStartSlot(
          selected
        );


      selectedEnd =
        a8PlasticEndSlot(
          selected
        );

    } else {

      const group =
        a8PlasticChordGroup(
          a8PlasticSelection.id
        );


      if (!group.length) {
        throw new Error(
          'SELECTED CHORD NOT FOUND'
        );
      }


      selectedStart =
        a8PlasticStartSlot(
          group[0]
        );


      selectedEnd =
        a8PlasticEndSlot(
          group[0]
        );
    }


    const occupiedIndex =
      ranges.findIndex(
        range =>
          range.start <=
            selectedStart &&
          range.end >=
            selectedEnd
      );


    if (
      occupiedIndex <
        0
    ) {
      throw new Error(
        'SELECTED MATERIAL RANGE NOT FOUND'
      );
    }


    const occupied =
      ranges[
        occupiedIndex
      ];


    const next =
      ranges[
        occupiedIndex +
        1
      ];


    if (!next) {
      throw new Error(
        'SILENCE NEEDS FOLLOWING ' +
        layer +
        ' MATERIAL'
      );
    }


    a8SilenceShiftLater(
      layer,
      next.start,
      amount
    );


    if (
      layer ===
        'C'
    ) {

      a8CPendingRestAnchor =
        null;
    }


    a8PlasticEnsureBars(
      a8SilenceLaneMaxEnd(
        layer
      )
    );


    render();


    const created =
      a8SilenceGaps(
        layer
      ).find(
        gap =>
          gap.start ===
            occupied.end
      );


    if (!created) {
      throw new Error(
        'SILENCE CREATION WITNESS FAILED'
      );
    }


    a8SilenceSelection = {
      ...created
    };


    a8SilenceEmit();


    showMessage(
      'SILENCE · LAYER ' +
      layer +
      ' · +' +
      a8ForSlots(
        amount
      ) +
      ' A8s',
      true
    );


    return (
      a8SilenceSnapshot()
    );
  }


  /*
   * ==========================================================
   * SELECTABLE B/C SILENCE FIELDS
   * ==========================================================
   */


  function a8SilenceInstallStyle() {

    if (
      document.getElementById(
        'a8UniversalSilenceStyle'
      )
    ) {
      return;
    }


    const style =
      document.createElement(
        'style'
      );


    style.id =
      'a8UniversalSilenceStyle';


    style.textContent = `
      .a8-layer-silence {
        display:flex;
        align-items:center;
        justify-content:center;
        min-width:0;
        overflow:hidden;
        padding:0;
        border:1px dashed currentColor;
        border-radius:.28rem;
        background:transparent;
        opacity:.48;
        font:inherit;
        font-size:.52rem;
        font-weight:700;
        cursor:pointer;
      }

      .a8-layer-silence:hover,
      .a8-layer-silence:focus-visible,
      .a8-layer-silence.is-selected {
        opacity:.9;
      }
    `;


    document.head.appendChild(
      style
    );
  }


  function a8SilenceRenderLane(
    layer,
    row
  ) {

    if (!row) {
      return;
    }


    const track =
      row.querySelector(
        '.a8-layer-track'
      );


    if (!track) {
      return;
    }


    const barNumber =
      Number(
        row.dataset
          .barNumber
      );


    if (
      !Number.isInteger(
        barNumber
      ) ||
      barNumber <
        1
    ) {
      return;
    }


    const barStart =
      (
        barNumber -
        1
      ) *
      BAR_SLOTS;


    const barEnd =
      barStart +
      BAR_SLOTS;


    const gaps =
      a8SilenceGaps(
        layer
      ).filter(
        gap =>
          gap.start <
            barEnd &&
          gap.end >
            barStart
      );


    if (!gaps.length) {
      return;
    }


    /*
     * If this entire visible bar is inside a real
     * silence interval, it is not an empty ADD lane.
     */
    track
      .querySelectorAll(
        '.a8-layer-empty'
      )
      .forEach(
        node =>
          node.remove()
      );


    gaps.forEach(
      gap => {

        const clipStart =
          Math.max(
            gap.start,
            barStart
          );


        const clipEnd =
          Math.min(
            gap.end,
            barEnd
          );


        const span =
          clipEnd -
          clipStart;


        if (
          span <=
            0
        ) {
          return;
        }


        const field =
          document.createElement(
            'button'
          );


        field.type =
          'button';


        field.className =
          'a8-layer-silence';


        if (
          a8SilenceSelection &&
          a8SilenceSelection.layer ===
            layer &&
          a8SilenceSelection.start ===
            gap.start &&
          a8SilenceSelection.end ===
            gap.end
        ) {

          field.classList.add(
            'is-selected'
          );
        }


        field.dataset
          .a8SilenceLayer =
            layer;


        field.dataset
          .a8SilenceStart =
            String(
              gap.start
            );


        field.dataset
          .a8SilenceEnd =
            String(
              gap.end
            );


        field.style.gridColumn =
          (
            clipStart -
            barStart +
            1
          ) +
          ' / span ' +
          span;


        field.textContent =
          span >=
            6
            ? 'SILENCE'
            : '·';


        field.title =
          'SILENCE · LAYER ' +
          layer +
          ' · ' +
          a8ForSlots(
            gap.end -
            gap.start
          ) +
          ' A8s';


        track.appendChild(
          field
        );
      }
    );
  }


  const a8SilenceBaseRenderABC =
    a8LayerRenderABC;


  a8LayerRenderABC =
    function () {

      a8SilenceBaseRenderABC();


      const card =
        document.querySelector(
          '.bar-card.active'
        );


      if (!card) {
        return;
      }


      a8SilenceRenderLane(
        'B',
        card.querySelector(
          '.a8-layer-b'
        )
      );


      a8SilenceRenderLane(
        'C',
        card.querySelector(
          '.a8-layer-c'
        )
      );
    };


  function a8SilenceInstallClick() {

    const host =
      document.getElementById(
        'bars'
      );


    if (
      !host ||
      host.dataset
        .a8UniversalSilence ===
        '1'
    ) {
      return;
    }


    host.dataset
      .a8UniversalSilence =
        '1';


    host.addEventListener(
      'click',
      event => {

        const field =
          event.target.closest(
            '[data-a8-silence-layer]'
          );


        if (
          !field ||
          !host.contains(
            field
          )
        ) {
          return;
        }


        event.preventDefault();
        event.stopImmediatePropagation();


        try {

          a8SilenceSelect(
            field.dataset
              .a8SilenceLayer,
            Number(
              field.dataset
                .a8SilenceStart
            ),
            Number(
              field.dataset
                .a8SilenceEnd
            )
          );

        } catch (
          error
        ) {

          showError(
            error
          );
        }
      },
      true
    );
  }


  a8SilenceInstallStyle();
  a8SilenceInstallClick();


  /*
   * ==========================================================
   * ROUTE ARRANGER TIMING TO SELECTED SILENCE
   * ==========================================================
   */


  if (
    !window.A8ComposerLabV1
  ) {
    throw new Error(
      'A8 COMPOSER LAB API NOT FOUND'
    );
  }


  const a8SilenceApi =
    window.A8ComposerLabV1;


  const a8SilenceBaseAdjustDuration =
    a8SilenceApi
      .adjustDuration
      .bind(
        a8SilenceApi
      );


  const a8SilenceBaseSetDuration =
    a8SilenceApi
      .setDuration
      .bind(
        a8SilenceApi
      );


  const a8SilenceBaseDelete =
    a8SilenceApi
      .deleteNote
      .bind(
        a8SilenceApi
      );


  const a8SilenceBaseAppendRest =
    typeof a8SilenceApi
      .a8UniversalAppendRest ===
        'function'
      ? a8SilenceApi
          .a8UniversalAppendRest
          .bind(
            a8SilenceApi
          )
      : null;


  const a8SilenceBaseOpenAppend =
    typeof a8SilenceApi
      .a8UniversalOpenAppend ===
        'function'
      ? a8SilenceApi
          .a8UniversalOpenAppend
          .bind(
            a8SilenceApi
          )
      : null;


  const a8SilenceBaseOpenAfterC =
    typeof a8SilenceApi
      .a8UniversalOpenAfterSelectedC ===
        'function'
      ? a8SilenceApi
          .a8UniversalOpenAfterSelectedC
          .bind(
            a8SilenceApi
          )
      : null;


  a8SilenceApi.adjustDuration =
    function (
      delta
    ) {

      if (
        a8SilenceSelection
      ) {

        return (
          a8SilenceAdjust(
            delta
          )
        );
      }


      return (
        a8SilenceBaseAdjustDuration(
          delta
        )
      );
    };


  a8SilenceApi.setDuration =
    function (
      value
    ) {

      if (
        a8SilenceSelection
      ) {

        return (
          a8SilenceSetDuration(
            value
          )
        );
      }


      return (
        a8SilenceBaseSetDuration(
          value
        )
      );
    };


  a8SilenceApi.deleteNote =
    function () {

      if (
        a8SilenceSelection
      ) {

        return (
          a8SilenceDelete()
        );
      }


      return (
        a8SilenceBaseDelete()
      );
    };


  /*
   * B popup SILENCE.
   *
   * A continues to use its existing explicit REST.
   */
  a8SilenceApi
    .a8UniversalAppendRest =
      function () {

        if (
          (
            a8SilenceSelection &&
            a8SilenceSelection.layer ===
              'B'
          ) ||
          (
            a8PlasticSelection &&
            a8PlasticSelection.layer ===
              'B'
          )
        ) {

          return (
            a8WithLastInput(
              'SILENCE',
              () =>
                a8SilenceCreateAfterSelected(
                  'B',
                  16
                )
            )
          );
        }


        if (
          !a8SilenceBaseAppendRest
        ) {
          throw new Error(
            'A SILENCE ROUTE NOT FOUND'
          );
        }


        return (
          a8SilenceBaseAppendRest()
        );
      };


  /*
   * C popup SILENCE.
   */
  a8SilenceApi
    .a8UniversalInsertCRest =
      function (
        slots =
          16
      ) {

        return (
          a8WithLastInput(
            'SILENCE',
            () =>
              a8SilenceCreateAfterSelected(
                'C',
                slots
              )
          )
        );
      };


  /*
   * Selected silence can also act as the temporal
   * address for B/C ADD NEXT.
   */
  a8SilenceApi
    .a8UniversalOpenAppend =
      function (
        layer,
        afterSelectedA =
          false
      ) {

        if (
          a8SilenceSelection &&
          a8SilenceSelection.layer ===
            layer
        ) {

          if (
            layer ===
              'B'
          ) {

            a8PlasticPendingBeatSlot =
              a8SilenceSelection.start;


            a8LayerOpenPreset(
              'B'
            );


            return;
          }


          if (
            layer ===
              'C'
          ) {

            a8PlasticPendingChordSlot =
              a8SilenceSelection.start;


            a8LayerOpenPreset(
              'C'
            );


            return;
          }
        }


        if (
          !a8SilenceBaseOpenAppend
        ) {
          throw new Error(
            'ADD NEXT ROUTE NOT FOUND'
          );
        }


        return (
          a8SilenceBaseOpenAppend(
            layer,
            afterSelectedA
          )
        );
      };


  a8SilenceApi
    .a8UniversalOpenAfterSelectedC =
      function () {

        if (
          a8SilenceSelection &&
          a8SilenceSelection.layer ===
            'C'
        ) {

          a8PlasticPendingChordSlot =
            a8SilenceSelection.start;


          a8LayerOpenPreset(
            'C'
          );


          return;
        }


        if (
          !a8SilenceBaseOpenAfterC
        ) {
          throw new Error(
            'C ADD NEXT ROUTE NOT FOUND'
          );
        }


        return (
          a8SilenceBaseOpenAfterC()
        );
      };


  /*
   * Selecting ordinary material releases SILENCE.
   */
  window.addEventListener(
    'a8-arranger-note-selected',
    a8SilenceClear
  );


  window.addEventListener(
    'a8-arranger-layer-selected',
    a8SilenceClear
  );


  window.addEventListener(
    'a8-last-input-restored',
    a8SilenceClear
  );


  render();


  /* A8-UNIVERSAL-SILENCE-V1B-BEGIN */

  /*
   * ==========================================================
   * UNIVERSAL SILENCE V1B
   * ==========================================================
   *
   * 1. SILENCE stays in the same visual B/C lane row.
   *
   * 2. A final B or C sound may have trailing SILENCE.
   *
   * 3. Trailing SILENCE survives SAVE / OPEN.
   *
   * 4. ADD NEXT from selected SILENCE begins AFTER
   *    the selected silent interval, exactly like A REST.
   */


  let a8SilenceTailSlots = {
    B:
      0,

    C:
      0
  };


  let a8SilencePendingTailInsertion =
    null;


  /*
   * Replace V1 gap discovery.
   *
   * Interior gaps remain derived from absolute
   * native event addresses.
   *
   * Only a final trailing gap needs explicit
   * persisted lane-end duration.
   */
  a8SilenceGaps =
    function (
      layer
    ) {

      const ranges =
        a8SilenceOccupiedRanges(
          layer
        );


      const gaps =
        [];


      for (
        let index = 0;
        index <
          ranges.length -
          1;
        index += 1
      ) {

        const left =
          ranges[
            index
          ];


        const right =
          ranges[
            index +
            1
          ];


        if (
          right.start >
            left.end
        ) {

          gaps.push({
            layer,

            start:
              left.end,

            end:
              right.start,

            tail:
              false
          });
        }
      }


      const tail =
        Number(
          a8SilenceTailSlots[
            layer
          ] ||
          0
        );


      if (
        ranges.length &&
        tail >
          0
      ) {

        const last =
          ranges[
            ranges.length -
            1
          ];


        gaps.push({
          layer,

          start:
            last.end,

          end:
            last.end +
            tail,

          tail:
            true
        });
      }


      return gaps;
    };


  /*
   * Keep whether the selected SILENCE is an
   * interior derived gap or persisted lane tail.
   */
  a8SilenceSelect =
    function (
      layer,
      start,
      end
    ) {

      const wantedStart =
        Number(
          start
        );


      const wantedEnd =
        Number(
          end
        );


      const gap =
        a8SilenceGaps(
          layer
        ).find(
          candidate =>
            candidate.start ===
              wantedStart &&
            candidate.end ===
              wantedEnd
        );


      if (!gap) {
        throw new Error(
          'SILENCE FIELD NO LONGER EXISTS'
        );
      }


      a8PlasticSelection =
        null;


      a8SilenceSelection = {
        ...gap
      };


      a8SilenceEmit();


      return (
        a8SilenceSnapshot()
      );
    };


  /*
   * Interior silence adjustment moves later material.
   *
   * Trailing silence has no later material, so its
   * own persisted lane-end duration changes instead.
   */
  a8SilenceAdjust =
    function (
      delta
    ) {

      if (
        !a8SilenceSelection
      ) {
        throw new Error(
          'SELECT SILENCE'
        );
      }


      const amount =
        Number(
          delta
        );


      if (
        !Number.isInteger(
          amount
        )
      ) {
        throw new Error(
          'SILENCE CHANGE MUST USE NATIVE SLOTS'
        );
      }


      const current = {
        ...a8SilenceSelection
      };


      const oldSlots =
        current.end -
        current.start;


      const nextSlots =
        oldSlots +
        amount;


      if (
        nextSlots <
          0
      ) {
        throw new Error(
          'SILENCE CANNOT BE NEGATIVE'
        );
      }


      if (
        current.tail ===
          true
      ) {

        a8SilenceTailSlots[
          current.layer
        ] =
          nextSlots;


        if (
          current.layer ===
            'C'
        ) {

          a8CPendingRestAnchor =
            null;
        }


        if (
          nextSlots ===
            0
        ) {

          a8SilenceSelection =
            null;


          render();


          window.dispatchEvent(
            new CustomEvent(
              'a8-arranger-silence-deleted'
            )
          );


          showMessage(
            'SILENCE · 0 · MATERIAL TOUCHES',
            true
          );


          return null;
        }


        a8SilenceSelection = {
          layer:
            current.layer,

          start:
            current.start,

          end:
            current.start +
            nextSlots,

          tail:
            true
        };


        a8PlasticEnsureBars(
          a8SilenceSelection.end
        );


        render();
        a8SilenceEmit();


        showMessage(
          'SILENCE · ' +
          a8ForSlots(
            nextSlots
          ) +
          ' A8s',
          true
        );


        return (
          a8SilenceSnapshot()
        );
      }


      /*
       * Interior gap.
       */
      if (
        amount !==
          0
      ) {

        a8SilenceShiftLater(
          current.layer,
          current.end,
          amount
        );
      }


      if (
        current.layer ===
          'C'
      ) {

        a8CPendingRestAnchor =
          null;
      }


      if (
        nextSlots ===
          0
      ) {

        a8SilenceSelection =
          null;


        render();


        window.dispatchEvent(
          new CustomEvent(
            'a8-arranger-silence-deleted'
          )
        );


        showMessage(
          'SILENCE · 0 · MATERIAL TOUCHES',
          true
        );


        return null;
      }


      a8SilenceSelection = {
        layer:
          current.layer,

        start:
          current.start,

        end:
          current.start +
            nextSlots,

        tail:
          false
      };


      a8PlasticEnsureBars(
        a8SilenceLaneMaxEnd(
          current.layer
        )
      );


      render();
      a8SilenceEmit();


      showMessage(
        'SILENCE · ' +
        a8ForSlots(
          nextSlots
        ) +
        ' A8s',
        true
      );


      return (
        a8SilenceSnapshot()
      );
    };


  /*
   * Create SILENCE after selected B/C material.
   *
   * If later material exists:
   *   move that later material forward.
   *
   * If this is the last material:
   *   create/increase persisted trailing SILENCE.
   */
  a8SilenceCreateAfterSelected =
    function (
      layer,
      slots =
        16
    ) {

      const amount =
        Number(
          slots
        );


      if (
        !Number.isInteger(
          amount
        ) ||
        amount <
          1
      ) {
        throw new Error(
          'SILENCE MUST BE POSITIVE NATIVE TIME'
        );
      }


      if (
        a8SilenceSelection &&
        a8SilenceSelection.layer ===
          layer
      ) {

        return (
          a8SilenceAdjust(
            amount
          )
        );
      }


      if (
        !a8PlasticSelection ||
        a8PlasticSelection.layer !==
          layer
      ) {
        throw new Error(
          'SELECT ' +
          layer +
          ' MATERIAL'
        );
      }


      const ranges =
        a8SilenceOccupiedRanges(
          layer
        );


      let selectedStart;
      let selectedEnd;


      if (
        layer ===
          'B'
      ) {

        const selected =
          a8PlasticBeatById(
            a8PlasticSelection.id
          );


        if (!selected) {
          throw new Error(
            'SELECTED BEAT NOT FOUND'
          );
        }


        selectedStart =
          a8PlasticStartSlot(
            selected
          );


        selectedEnd =
          a8PlasticEndSlot(
            selected
          );

      } else {

        const group =
          a8PlasticChordGroup(
            a8PlasticSelection.id
          );


        if (!group.length) {
          throw new Error(
            'SELECTED CHORD NOT FOUND'
          );
        }


        selectedStart =
          a8PlasticStartSlot(
            group[0]
          );


        selectedEnd =
          a8PlasticEndSlot(
            group[0]
          );
      }


      const occupiedIndex =
        ranges.findIndex(
          range =>
            range.start <=
              selectedStart &&
            range.end >=
              selectedEnd
        );


      if (
        occupiedIndex <
          0
      ) {
        throw new Error(
          'SELECTED MATERIAL RANGE NOT FOUND'
        );
      }


      const occupied =
        ranges[
          occupiedIndex
        ];


      const next =
        ranges[
          occupiedIndex +
          1
        ];


      /*
       * FINAL MATERIAL:
       * create trailing lane silence.
       */
      if (!next) {

        a8SilenceTailSlots[
          layer
        ] =
          Number(
            a8SilenceTailSlots[
              layer
            ] ||
            0
          ) +
          amount;


        if (
          layer ===
            'C'
        ) {

          a8CPendingRestAnchor =
            null;
        }


        const end =
          occupied.end +
          a8SilenceTailSlots[
            layer
          ];


        a8PlasticEnsureBars(
          end
        );


        render();


        const created =
          a8SilenceGaps(
            layer
          ).find(
            gap =>
              gap.tail ===
                true
          );


        if (!created) {
          throw new Error(
            'TRAILING SILENCE CREATION WITNESS FAILED'
          );
        }


        a8SilenceSelection = {
          ...created
        };


        a8SilenceEmit();


        showMessage(
          'SILENCE · LAYER ' +
          layer +
          ' · +' +
          a8ForSlots(
            amount
          ) +
          ' A8s',
          true
        );


        return (
          a8SilenceSnapshot()
        );
      }


      /*
       * INTERIOR MATERIAL:
       * create/increase real empty native time.
       */
      a8SilenceShiftLater(
        layer,
        next.start,
        amount
      );


      if (
        layer ===
          'C'
      ) {

        a8CPendingRestAnchor =
          null;
      }


      a8PlasticEnsureBars(
        a8SilenceLaneMaxEnd(
          layer
        ) +
        Number(
          a8SilenceTailSlots[
            layer
          ] ||
          0
        )
      );


      render();


      const created =
        a8SilenceGaps(
          layer
        ).find(
          gap =>
            gap.tail !==
              true &&
            gap.start ===
              occupied.end
        );


      if (!created) {
        throw new Error(
          'SILENCE CREATION WITNESS FAILED'
        );
      }


      a8SilenceSelection = {
        ...created
      };


      a8SilenceEmit();


      showMessage(
        'SILENCE · LAYER ' +
        layer +
        ' · +' +
        a8ForSlots(
          amount
        ) +
        ' A8s',
        true
      );


      return (
        a8SilenceSnapshot()
      );
    };


  /*
   * ==========================================================
   * SAVE / OPEN TRAILING SILENCE
   * ==========================================================
   *
   * Interior silence already survives because it is encoded
   * by absolute B/C event positions.
   *
   * Only silence after the final event requires metadata.
   */


  function a8SilenceReadTail(
    score,
    layer
  ) {

    const source =
      score &&
      score.layers &&
      score.layers[
        layer
      ]
        ? score.layers[
            layer
          ]
        : null;


    if (
      !source ||
      source.trailingSilenceA8 ===
        undefined ||
      source.trailingSilenceA8 ===
        null
    ) {

      return 0;
    }


    const slots =
      slotsForDuration(
        fracText(
          source
            .trailingSilenceA8
        )
      );


    if (
      !Number.isInteger(
        slots
      ) ||
      slots <
        1
    ) {
      throw new Error(
        'TRAILING SILENCE MUST BE POSITIVE NATIVE TIME'
      );
    }


    return slots;
  }


  const a8SilenceV1BBaseSaveScore =
    saveScore;


  saveScore =
    function () {

      const score =
        a8SilenceV1BBaseSaveScore();


      [
        'B',
        'C'
      ].forEach(
        layer => {

          const slots =
            Number(
              a8SilenceTailSlots[
                layer
              ] ||
              0
            );


          if (
            slots <=
              0
          ) {
            return;
          }


          score.layers = {
            ...(
              score.layers ||
              {}
            )
          };


          const existing =
            score.layers[
              layer
            ] ||
            {
              role:
                layer ===
                  'B'
                  ? 'BEATS'
                  : 'CHORDS',

              placement:
                'BAR_ADDRESS',

              events:
                []
            };


          score.layers[
            layer
          ] = {
            ...existing,

            trailingSilenceA8:
              a8ForSlots(
                slots
              )
          };
        }
      );


      return score;
    };


  const a8SilenceV1BBaseImportScore =
    importScore;


  importScore =
    function (
      score
    ) {

      const incomingTail = {
        B:
          a8SilenceReadTail(
            score,
            'B'
          ),

        C:
          a8SilenceReadTail(
            score,
            'C'
          )
      };


      const result =
        a8SilenceV1BBaseImportScore(
          score
        );


      a8SilenceTailSlots = {
        ...incomingTail
      };


      a8SilenceSelection =
        null;


      a8SilencePendingTailInsertion =
        null;


      const end =
        Math.max(
          a8SilenceLaneMaxEnd(
            'B'
          ) +
          a8SilenceTailSlots.B,

          a8SilenceLaneMaxEnd(
            'C'
          ) +
          a8SilenceTailSlots.C
        );


      if (
        end >
          0
      ) {

        a8PlasticEnsureBars(
          end
        );
      }


      render();


      return result;
    };


  /*
   * ==========================================================
   * ADD NEXT FROM SILENCE
   * ==========================================================
   *
   * Same model as A REST:
   *
   * selected SILENCE -> new material begins at SILENCE END.
   */


  const a8SilenceV1BBaseOpenAppend =
    a8SilenceApi
      .a8UniversalOpenAppend
      .bind(
        a8SilenceApi
      );


  a8SilenceApi
    .a8UniversalOpenAppend =
      function (
        layer,
        afterSelectedA =
          false
      ) {

        if (
          a8SilenceSelection &&
          a8SilenceSelection.layer ===
            layer
        ) {

          const slot =
            a8SilenceSelection.end;


          a8SilencePendingTailInsertion =
            a8SilenceSelection.tail ===
              true
              ? {
                  layer,

                  slot
                }
              : null;


          if (
            layer ===
              'B'
          ) {

            a8PlasticPendingBeatSlot =
              slot;


            a8LayerOpenPreset(
              'B'
            );


            return;
          }


          if (
            layer ===
              'C'
          ) {

            a8PlasticPendingChordSlot =
              slot;


            a8LayerOpenPreset(
              'C'
            );


            return;
          }
        }


        a8SilencePendingTailInsertion =
          null;


        return (
          a8SilenceV1BBaseOpenAppend(
            layer,
            afterSelectedA
          )
        );
      };


  const a8SilenceV1BBaseOpenAfterC =
    a8SilenceApi
      .a8UniversalOpenAfterSelectedC
      .bind(
        a8SilenceApi
      );


  a8SilenceApi
    .a8UniversalOpenAfterSelectedC =
      function () {

        if (
          a8SilenceSelection &&
          a8SilenceSelection.layer ===
            'C'
        ) {

          const slot =
            a8SilenceSelection.end;


          a8SilencePendingTailInsertion =
            a8SilenceSelection.tail ===
              true
              ? {
                  layer:
                    'C',

                  slot
                }
              : null;


          a8PlasticPendingChordSlot =
            slot;


          a8LayerOpenPreset(
            'C'
          );


          return;
        }


        a8SilencePendingTailInsertion =
          null;


        return (
          a8SilenceV1BBaseOpenAfterC()
        );
      };


  /*
   * When sound is actually installed after a trailing
   * silence, that tail becomes an ordinary interior gap.
   *
   * Clear the explicit tail only AFTER successful install.
   */


  const a8SilenceV1BBaseBeatInstall =
    a8BeatInstallPreset;


  a8BeatInstallPreset =
    function (
      score
    ) {

      const pending =
        a8SilencePendingTailInsertion;


      const consume =
        Boolean(
          pending &&
          pending.layer ===
            'B' &&
          a8PlasticPendingBeatSlot ===
            pending.slot
        );


      const result =
        a8SilenceV1BBaseBeatInstall(
          score
        );


      if (consume) {

        a8SilenceTailSlots.B =
          0;


        a8SilencePendingTailInsertion =
          null;


        a8SilenceSelection =
          null;


        render();
      }


      return result;
    };


  const a8SilenceV1BBaseChordInstall =
    a8ChordInstallPreset;


  a8ChordInstallPreset =
    function (
      preset
    ) {

      const pending =
        a8SilencePendingTailInsertion;


      const consume =
        Boolean(
          pending &&
          pending.layer ===
            'C' &&
          a8PlasticPendingChordSlot ===
            pending.slot
        );


      const result =
        a8SilenceV1BBaseChordInstall(
          preset
        );


      if (consume) {

        a8SilenceTailSlots.C =
          0;


        a8SilencePendingTailInsertion =
          null;


        a8SilenceSelection =
          null;


        render();
      }


      return result;
    };


  /*
   * ==========================================================
   * SAME PHYSICAL ROW
   * ==========================================================
   *
   * CSS Grid auto-placement was free to assign appended
   * SILENCE fields another implicit row.
   *
   * Silence belongs on the same timeline row as sound.
   */


  const a8SilenceV1BStyle =
    document.createElement(
      'style'
    );


  a8SilenceV1BStyle.id =
    'a8UniversalSilenceV1BStyle';


  a8SilenceV1BStyle.textContent = `
    .a8-layer-track > .a8-layer-silence {
      grid-row:1 !important;
      align-self:stretch;
    }
  `;


  document.head.appendChild(
    a8SilenceV1BStyle
  );


  render();


  /* A8-SILENCE-SELECTED-END-V1-BEGIN */

  /*
   * ==========================================================
   * SILENCE START AUTHORITY
   * ==========================================================
   *
   * OLD:
   *
   *   selected object
   *        ↓
   *   merged occupied run
   *        ↓
   *   SILENCE after merged-run end
   *
   * NEW:
   *
   *   selected object's exact end
   *        ↓
   *   SILENCE
   *        ↓
   *   later same-lane material
   *
   * Touching later material moves forward.
   *
   * A different object which genuinely crosses the selected
   * object's end would make real silence impossible without
   * cutting that object, so refuse that exceptional case
   * instead of pretending silence exists.
   */


  function a8SilenceSelectedBoundary(
    layer
  ) {

    if (
      !a8PlasticSelection ||
      a8PlasticSelection.layer !==
        layer
    ) {
      throw new Error(
        'SELECT ' +
        layer +
        ' MATERIAL'
      );
    }


    if (
      layer ===
        'B'
    ) {

      const selected =
        a8PlasticBeatById(
          a8PlasticSelection.id
        );


      if (!selected) {
        throw new Error(
          'SELECTED BEAT NOT FOUND'
        );
      }


      const selectedStart =
        a8PlasticStartSlot(
          selected
        );


      const selectedEnd =
        a8PlasticEndSlot(
          selected
        );


      const crossing =
        a8BeatLayerB.find(
          event => {

            if (
              event.hitId ===
                selected.hitId
            ) {
              return false;
            }


            const start =
              a8PlasticStartSlot(
                event
              );


            const end =
              a8PlasticEndSlot(
                event
              );


            return (
              start <
                selectedEnd &&
              end >
                selectedEnd
            );
          }
        );


      if (crossing) {
        throw new Error(
          'B MATERIAL CROSSES SELECTED END'
        );
      }


      const laterStarts =
        a8BeatLayerB
          .filter(
            event =>
              event.hitId !==
                selected.hitId
          )
          .map(
            event =>
              a8PlasticStartSlot(
                event
              )
          )
          .filter(
            start =>
              start >=
                selectedEnd
          );


      return {
        layer:
          'B',

        start:
          selectedStart,

        end:
          selectedEnd,

        nextStart:
          laterStarts.length
            ? Math.min(
                ...laterStarts
              )
            : null
      };
    }


    if (
      layer ===
        'C'
    ) {

      const group =
        a8PlasticChordGroup(
          a8PlasticSelection.id
        );


      if (!group.length) {
        throw new Error(
          'SELECTED CHORD NOT FOUND'
        );
      }


      const selectedStart =
        a8PlasticStartSlot(
          group[0]
        );


      const selectedEnd =
        a8PlasticEndSlot(
          group[0]
        );


      const others =
        a8PlasticChordGroups()
          .filter(
            candidate =>
              candidate[0]
                .chordInstanceId !==
              a8PlasticSelection.id
          )
          .map(
            candidate => ({
              start:
                a8PlasticStartSlot(
                  candidate[0]
                ),

              end:
                a8PlasticEndSlot(
                  candidate[0]
                )
            })
          );


      const crossing =
        others.find(
          range =>
            range.start <
              selectedEnd &&
            range.end >
              selectedEnd
        );


      if (crossing) {
        throw new Error(
          'C MATERIAL CROSSES SELECTED END'
        );
      }


      const laterStarts =
        others
          .map(
            range =>
              range.start
          )
          .filter(
            start =>
              start >=
                selectedEnd
          );


      return {
        layer:
          'C',

        start:
          selectedStart,

        end:
          selectedEnd,

        nextStart:
          laterStarts.length
            ? Math.min(
                ...laterStarts
              )
            : null
      };
    }


    throw new Error(
      'SILENCE LAYER MUST BE B OR C'
    );
  }


  a8SilenceCreateAfterSelected =
    function (
      layer,
      slots =
        16
    ) {

      const amount =
        Number(
          slots
        );


      if (
        !Number.isInteger(
          amount
        ) ||
        amount <
          1
      ) {
        throw new Error(
          'SILENCE MUST BE POSITIVE NATIVE TIME'
        );
      }


      /*
       * Selected SILENCE:
       * increase that exact silence.
       */
      if (
        a8SilenceSelection &&
        a8SilenceSelection.layer ===
          layer
      ) {

        return (
          a8SilenceAdjust(
            amount
          )
        );
      }


      const boundary =
        a8SilenceSelectedBoundary(
          layer
        );


      /*
       * There is material beginning at or after the
       * selected object's exact end.
       *
       * Move it and everything later forward by the
       * requested silence amount.
       */
      if (
        boundary.nextStart !==
          null
      ) {

        a8SilenceShiftLater(
          layer,
          boundary.nextStart,
          amount
        );


        if (
          layer ===
            'C'
        ) {

          a8CPendingRestAnchor =
            null;
        }


        a8PlasticEnsureBars(
          a8SilenceLaneMaxEnd(
            layer
          ) +
          Number(
            a8SilenceTailSlots[
              layer
            ] ||
            0
          )
        );


        render();


        const created =
          a8SilenceGaps(
            layer
          ).find(
            gap =>
              gap.tail !==
                true &&
              gap.start ===
                boundary.end
          );


        if (!created) {
          throw new Error(
            'SELECTED-END SILENCE WITNESS FAILED'
          );
        }


        a8SilenceSelection = {
          ...created
        };


        a8SilenceEmit();


        showMessage(
          'SILENCE · LAYER ' +
          layer +
          ' · AFTER SELECTED · +' +
          a8ForSlots(
            amount
          ) +
          ' A8s',
          true
        );


        return (
          a8SilenceSnapshot()
        );
      }


      /*
       * Selected object really is final material.
       *
       * Trailing silence begins at this selected
       * object's exact end.
       */
      a8SilenceTailSlots[
        layer
      ] =
        Number(
          a8SilenceTailSlots[
            layer
          ] ||
          0
        ) +
        amount;


      if (
        layer ===
          'C'
      ) {

        a8CPendingRestAnchor =
          null;
      }


      a8PlasticEnsureBars(
        boundary.end +
        a8SilenceTailSlots[
          layer
        ]
      );


      render();


      const created =
        a8SilenceGaps(
          layer
        ).find(
          gap =>
            gap.tail ===
              true &&
            gap.start ===
              boundary.end
        );


      if (!created) {
        throw new Error(
          'SELECTED-END TRAILING SILENCE WITNESS FAILED'
        );
      }


      a8SilenceSelection = {
        ...created
      };


      a8SilenceEmit();


      showMessage(
        'SILENCE · LAYER ' +
        layer +
        ' · AFTER SELECTED · +' +
        a8ForSlots(
          amount
        ) +
        ' A8s',
        true
      );


      return (
        a8SilenceSnapshot()
      );
    };

  /* A8-SILENCE-SELECTED-END-V1-END */


  /* A8-UNIVERSAL-SILENCE-V1B-END */


  /* A8-UNIVERSAL-SILENCE-V1-END */


  /* A8-AUDITION-CURRENT-BAR-V1-BEGIN */

  /*
   * ==========================================================
   * AUDITION CURRENT BAR
   * ==========================================================
   *
   * BAR = 64-SLOT VIEW WINDOW.
   * BAR IS NOT A MUSICAL WALL.
   *
   * Build the normal complete A+B+C audition score first,
   * then take exactly the currently active 64-slot window.
   *
   * Events crossing either side of the bar remain part of
   * the audition, but are clipped to the audible window.
   *
   * SCORE DATA IS NEVER MODIFIED.
   */


  function a8CurrentBarAuditionScore() {

    const bar =
      a8LayerActiveBarNumber();


    const windowStart =
      (
        bar -
        1
      ) *
      BAR_SLOTS;


    const windowEnd =
      windowStart +
      BAR_SLOTS;


    /*
     * This is the final wrapped audition builder,
     * therefore it already contains:
     *
     *   A · NOTE / REST
     *   B · BEAT
     *   C · CHORD
     */
    const full =
      a8RippleAuditionScore();


    const events =
      [];


    (
      Array.isArray(
        full.events
      )
        ? full.events
        : []
    ).forEach(
      event => {

        const start =
          a8LayerSlotsForPosition(
            event.startA8
          );


        const duration =
          slotsForDuration(
            event.durationA8
          );


        const end =
          start +
          duration;


        const audibleStart =
          Math.max(
            start,
            windowStart
          );


        const audibleEnd =
          Math.min(
            end,
            windowEnd
          );


        if (
          audibleEnd <=
            audibleStart
        ) {
          return;
        }


        events.push({
          ...event,

          startA8:
            a8ForSlots(
              audibleStart -
              windowStart
            ),

          durationA8:
            a8ForSlots(
              audibleEnd -
              audibleStart
            )
        });
      }
    );


    if (!events.length) {
      throw new Error(
        'NO MUSIC IN BAR ' +
        bar
      );
    }


    return {
      ...full,

      title:
        (
          full.title ||
          'Untitled A8 composition'
        ) +
        ' · BAR ' +
        bar,

      events
    };
  }


  window.addEventListener(
    'a8-arranger-audition-bar',
    () => {

      try {

        player
          .play(
            a8CurrentBarAuditionScore()
          )
          .catch(
            showError
          );

      } catch (
        error
      ) {

        showError(
          error
        );
      }
    }
  );

  /* A8-AUDITION-CURRENT-BAR-V1-END */


})();
