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


  function durationOptions() {
    const direct = [
      '1/16',
      '1/8',
      '1/4',
      '3/8',
      '1/2',
      '3/4',
      '1',
      '2',
      '4'
    ];


    const adjust = [
      [-8, '−1/2'],
      [-4, '−1/4'],
      [-2, '−1/8'],
      [-1, '−1/16'],
      [ 1, '+1/16'],
      [ 2, '+1/8'],
      [ 4, '+1/4'],
      [ 8, '+1/2']
    ];


    return (
      direct.map(
        value => `
          <button
            class="seg-btn"
            data-duration="${value}"
          >
            ${value}
          </button>
        `
      ).join('') +

      `
        <span
          style="
            display:inline-block;
            margin:0 .4rem;
            opacity:.65
          "
        >
          ADJUST
        </span>
      ` +

      adjust.map(
        ([slots, label]) => `
          <button
            class="seg-btn"
            data-duration-adjust="${slots}"
          >
            ${label}
          </button>
        `
      ).join('')
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
                type:
                  'application/json'
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


  /* A8-RIPPLE-PLAY-ALL-V1-BEGIN */

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

  $('bars')
    .addEventListener(
      'click',
      event => {
        const button =
          event.target.closest(
            '[data-bar-action="play"]'
          );

        if (!button) {
          return;
        }

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


  function a8RippleLabelPlayAll() {
    document
      .querySelectorAll(
        '[data-bar-action="play"]'
      )
      .forEach(
        button => {
          button.textContent =
            '▶ PLAY ALL';
        }
      );
  }


  const a8RipplePlayAllBaseRender =
    render;

  render =
    function () {
      a8RipplePlayAllBaseRender();
      a8RippleLabelPlayAll();
    };


  a8RippleLabelPlayAll();



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


  /* A8-RIPPLE-PLAY-SELECTED-V1-BEGIN */

  /*
   * PLAY SELECTED
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


  function a8RippleEnsurePlaySelectedButton() {
    const actions =
      document.querySelector(
        '#a8RippleControls .a8-ripple-actions'
      );


    if (!actions) {
      return;
    }


    if (
      document.getElementById(
        'a8RipplePlaySelected'
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


    button.id =
      'a8RipplePlaySelected';


    button.textContent =
      '▶ PLAY SELECTED';


    actions.prepend(
      button
    );
  }


  $('a8RippleToolbarHost')
    .addEventListener(
      'click',
      event => {
        const button =
          event.target.closest(
            '#a8RipplePlaySelected'
          );


        if (!button) {
          return;
        }


        event.preventDefault();
        event.stopImmediatePropagation();


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
      },
      true
    );


  const a8RipplePlaySelectedBaseRender =
    render;


  render =
    function () {
      a8RipplePlaySelectedBaseRender();
      a8RippleEnsurePlaySelectedButton();
    };


  a8RippleEnsurePlaySelectedButton();


  /* A8-RIPPLE-PLAY-SELECTED-V1-END */

  /* A8-RIPPLE-PLAY-ALL-V1-END */

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

})();
