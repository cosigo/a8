(() => {
  'use strict';

  /*
   * A8 MUSIC REVIEW · CURATOR ADAPTER V2
   *
   * PURPOSE:
   *   audition submitted / approved .a8m compositions
   *   using the EXISTING A8MusicPlayerV1.
   *
   * THIS FILE DOES NOT DEFINE MUSIC TIME.
   *
   * Review storage:
   *   8 bars
   *   64 exact slots / bar
   *   local event startA8 inside each bar
   *
   * Player input:
   *   one flat A8M-1 events[] array
   *
   * This adapter performs only exact native slot translation:
   *
   *   global slot =
   *     barIndex * 64 +
   *     local start slot
   *
   * Browser/WebAudio remains final speaker adapter only.
   */

  const BAR_SLOTS =
    64n;

  const SLOTS_PER_A8_SECOND =
    16n;


  function statusNode() {
    let node =
      document.getElementById(
        'a8CuratorAuditionStatus'
      );

    if (node) {
      return node;
    }

    node =
      document.createElement(
        'section'
      );

    node.id =
      'a8CuratorAuditionStatus';

    node.className =
      'panel';

    node.innerHTML = `
      <h2>Curator audition</h2>

      <div
        id="a8CuratorAuditionRead"
        class="current"
      >
        IDLE · NO SUBMISSION PLAYING
      </div>

      <p class="sub">
        Uses the existing A8 music player.
        Review transport does not define score timing.
      </p>
    `;

    const inspection =
      document.getElementById(
        'inspection'
      );

    if (inspection) {
      inspection.parentNode
        .insertBefore(
          node,
          inspection
        );
    } else {
      document.body
        .appendChild(node);
    }

    return node;
  }


  function setStatus(
    text
  ) {
    statusNode();

    const node =
      document.getElementById(
        'a8CuratorAuditionRead'
      );

    if (node) {
      node.textContent =
        String(text);
    }
  }


  async function jsonApi(
    url,
    options = {}
  ) {
    const response =
      await fetch(
        url,
        {
          cache:
            'no-store',

          ...options,

          headers: {
            'Content-Type':
              'application/json',

            ...(
              options.headers ||
              {}
            )
          }
        }
      );

    const body =
      await response
        .json()
        .catch(
          () => ({})
        );

    if (!response.ok) {
      throw new Error(
        body.message ||
        (
          'REQUEST FAILED · HTTP ' +
          response.status
        )
      );
    }

    return body;
  }


  function integerFraction(
    value,
    label
  ) {
    const text =
      String(
        value ?? ''
      ).trim();

    if (!text) {
      throw new Error(
        label +
        ' REQUIRED'
      );
    }

    let n;
    let d;

    if (
      text.includes('/')
    ) {
      const parts =
        text.split('/');

      if (
        parts.length !== 2
      ) {
        throw new Error(
          'INVALID ' +
          label
        );
      }

      n =
        BigInt(
          parts[0]
        );

      d =
        BigInt(
          parts[1]
        );

    } else {
      n =
        BigInt(text);

      d =
        1n;
    }

    if (
      d === 0n
    ) {
      throw new Error(
        'INVALID ' +
        label
      );
    }

    if (
      d < 0n
    ) {
      n =
        -n;

      d =
        -d;
    }

    return {
      n,
      d
    };
  }


  function exactGridSlots(
    value,
    label
  ) {
    const {
      n,
      d
    } =
      integerFraction(
        value,
        label
      );

    const scaled =
      n *
      SLOTS_PER_A8_SECOND;

    if (
      scaled % d !== 0n
    ) {
      throw new Error(
        label +
        ' DOES NOT LAND ON 1/16 A8 GRID'
      );
    }

    return (
      scaled /
      d
    );
  }


  function flattenReviewScore(
    score
  ) {
    if (
      !score ||
      typeof score !==
        'object'
    ) {
      throw new Error(
        'REVIEW SCORE REQUIRED'
      );
    }

    if (
      score.format !==
        'A8M-1'
    ) {
      throw new Error(
        'UNSUPPORTED REVIEW SCORE FORMAT'
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
        'REVIEW SCORE MUST CONTAIN EXACTLY 8 BARS'
      );
    }

    const events =
      [];

    score.bars.forEach(
      (
        bar,
        barIndex
      ) => {
        if (
          !bar ||
          !Array.isArray(
            bar.events
          )
        ) {
          throw new Error(
            'INVALID BAR ' +
            (
              barIndex +
              1
            )
          );
        }

        if (
          bar.complete !==
            true
        ) {
          throw new Error(
            'INCOMPLETE BAR ' +
            (
              barIndex +
              1
            )
          );
        }

        for (
          const event
          of bar.events
        ) {
          const localStart =
            exactGridSlots(
              event.startA8,
              'EVENT START'
            );

          const duration =
            exactGridSlots(
              event.durationA8,
              'EVENT DURATION'
            );

          if (
            localStart <
              0n ||
            localStart >=
              BAR_SLOTS
          ) {
            throw new Error(
              'EVENT START OUTSIDE BAR'
            );
          }

          if (
            duration <=
              0n ||
            localStart +
              duration >
              BAR_SLOTS
          ) {
            throw new Error(
              'EVENT EXTENDS OUTSIDE BAR'
            );
          }

          const globalStart =
            (
              BigInt(
                barIndex
              ) *
              BAR_SLOTS
            ) +
            localStart;

          events.push({
            ...event,

            /*
             * Exact native fraction.
             *
             * Deliberately retained as slot/16
             * rather than converted to a decimal.
             */
            startA8:
              globalStart
                .toString() +
              '/16'
          });
        }
      }
    );

    return {
      ...score,
      events
    };
  }


  if (
    typeof window
      .A8MusicPlayerV1 !==
      'function'
  ) {
    setStatus(
      'A8 MUSIC PLAYER NOT AVAILABLE'
    );

    return;
  }


  const player =
    new window
      .A8MusicPlayerV1({

        onState:
          state => {
            if (
              state.type ===
              'CORE_READY'
            ) {
              setStatus(
                'CORE20 CONNECTED · CURATOR PREVIEW READY'
              );

              return;
            }

            if (
              state.type ===
              'PLAYING'
            ) {
              setStatus(
                'PLAYING · ' +
                state.eventCount +
                ' EXPLICIT A8 EVENTS'
              );

              return;
            }

            if (
              state.type ===
              'POSITION'
            ) {
              setStatus(
                'PLAYING · ' +
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
              setStatus(
                'AUDITION COMPLETE'
              );

              return;
            }

            if (
              state.type ===
              'STOPPED'
            ) {
              setStatus(
                state.reason ||
                'AUDITION STOPPED'
              );
            }
          }
      });


  async function loadItem(
    bucket,
    id
  ) {
    const result =
      await jsonApi(
        '/api/music-review/admin/item' +
        '?bucket=' +
        encodeURIComponent(
          bucket
        ) +
        '&id=' +
        encodeURIComponent(
          id
        )
      );

    return result.item;
  }


  async function playItem(
    bucket,
    id
  ) {
    setStatus(
      'LOADING CURATOR PREVIEW…'
    );

    const item =
      await loadItem(
        bucket,
        id
      );

    const score =
      flattenReviewScore(
        item.score
      );

    /*
     * Explicit curator PLAY action performs
     * the existing player Core20 connection.
     *
     * No autonomous page-load connection.
     */
    await player
      .connectCore();

    await player
      .play(
        score
      );
  }


  async function promoteApproved(
    id,
    slot
  ) {
    const name =
      String(slot)
        .toUpperCase();

    const yes =
      window.confirm(
        'Promote this composition as the ' +
        name +
        ' winner?'
      );

    if (!yes) {
      return;
    }

    player.stop(
      'CURATOR PROMOTION'
    );

    setStatus(
      'PROMOTING ' +
      name +
      ' WINNER…'
    );

    const result =
      await jsonApi(
        '/api/music-review/admin/promote',
        {
          method:
            'POST',

          body:
            JSON.stringify({
              id,
              slot
            })
        }
      );

    setStatus(
      '★ ' +
      name +
      ' WINNER · ' +
      result.title +
      ' · ' +
      result.composer
    );
  }


  async function removeApproved(
    id,
    card
  ) {
    const yes =
      window.confirm(
        'Permanently remove this composition from the approved library? ' +
        'Any non-current published archive copy for this submission will also be removed. ' +
        'The current ditty is protected by the server.'
      );

    if (!yes) {
      return;
    }

    player.stop(
      'CURATOR LIBRARY ACTION'
    );

    setStatus(
      'REMOVING APPROVED COMPOSITION…'
    );

    const result =
      await jsonApi(
        '/api/music-review/admin/remove-approved',
        {
          method:
            'POST',

          body:
            JSON.stringify({
              id
            })
        }
      );

    card.remove();

    const approved =
      document.getElementById(
        'approved'
      );

    if (
      approved &&
      !approved.querySelector(
        '[data-id]'
      )
    ) {
      approved.textContent =
        'No approved compositions yet.';
    }

    setStatus(
      'REMOVED · ' +
      result.id +
      (
        result.publishedCopyRemoved
          ? ' · PUBLISHED ARCHIVE COPY REMOVED'
          : ''
      )
    );
  }


  function button(
    action,
    text
  ) {
    const node =
      document.createElement(
        'button'
      );

    node.type =
      'button';

    node.dataset
      .curatorAction =
        action;

    node.textContent =
      text;

    return node;
  }


  function enhanceCard(
    card
  ) {
    if (
      !card ||
      card.dataset
        .curatorV2 ===
        '1'
    ) {
      return;
    }

    const actions =
      card.querySelector(
        '.actions'
      );

    if (!actions) {
      return;
    }

    card.dataset
      .curatorV2 =
        '1';

    const play =
      button(
        'play',
        card.dataset.bucket ===
          'incoming'
          ? '▶ PLAY SUBMISSION'
          : '▶ PLAY'
      );

    const stop =
      button(
        'stop',
        '■ STOP'
      );

    actions.prepend(
      stop
    );

    actions.prepend(
      play
    );

    if (
      card.dataset.bucket ===
        'approved'
    ) {
      actions.appendChild(
        button(
          'promote-weekly',
          '★ PROMOTE WEEKLY'
        )
      );

      actions.appendChild(
        button(
          'promote-monthly',
          '★ PROMOTE MONTHLY'
        )
      );

      actions.appendChild(
        button(
          'promote-yearly',
          '★ PROMOTE YEARLY'
        )
      );

      actions.appendChild(
        button(
          'remove-approved',
          'REMOVE FROM LIBRARY'
        )
      );
    }
  }


  function enhance(
    root = document
  ) {
    root
      .querySelectorAll(
        '[data-id][data-bucket]'
      )
      .forEach(
        enhanceCard
      );
  }


  document.body
    .addEventListener(
      'click',
      async event => {
        const control =
          event.target.closest(
            '[data-curator-action]'
          );

        if (!control) {
          return;
        }

        const card =
          control.closest(
            '[data-id][data-bucket]'
          );

        if (!card) {
          return;
        }

        const action =
          control.dataset
            .curatorAction;

        try {
          if (
            action ===
              'play'
          ) {
            control.disabled =
              true;

            try {
              await playItem(
                card.dataset.bucket,
                card.dataset.id
              );
            } finally {
              control.disabled =
                false;
            }

            return;
          }

          if (
            action ===
              'stop'
          ) {
            player.stop(
              'STOPPED BY CURATOR'
            );

            return;
          }

          if (
            action ===
              'promote-weekly' ||
            action ===
              'promote-monthly' ||
            action ===
              'promote-yearly'
          ) {
            await promoteApproved(
              card.dataset.id,
              action.replace(
                'promote-',
                ''
              )
            );

            return;
          }

          if (
            action ===
              'remove-approved'
          ) {
            await removeApproved(
              card.dataset.id,
              card
            );
          }

        } catch (error) {
          setStatus(
            'ERROR · ' +
            (
              error.message ||
              String(error)
            )
          );
        }
      }
    );


  /*
   * Existing review page owns list rendering.
   * This observer decorates new cards only.
   *
   * It never touches score timing.
   */
  const observer =
    new MutationObserver(
      () => {
        enhance();
      }
    );

  observer.observe(
    document.body,
    {
      childList:
        true,

      subtree:
        true
    }
  );

  statusNode();
  enhance();

})();
