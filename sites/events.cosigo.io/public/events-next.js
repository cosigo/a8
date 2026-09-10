/* A8 EVENTS NEXT STAR BRIDGE v1 */
(()=>{
  'use strict';

  const CALENDAR_URL=
    'https://calendar.cosigo.io/api/core20/calendar';

  const EVENTS_URL=
    '/data/astronomical-events.json';

  const STARS_URL=
    'https://stars.cosigo.io/a8_celestial_atlas_decimal_review_v0_2.html';

  const grid=
    document.getElementById('eventGrid');

  if(!grid){
    console.warn(
      'A8 Events NEXT · eventGrid not found'
    );
    return;
  }

  if(
    document.getElementById(
      'a8EventsLiveBridge'
    )
  ){
    return;
  }


  const root=
    document.createElement('section');

  root.id='a8EventsLiveBridge';
  root.className='a8-events-live-bridge';

  grid.before(root);


  function textElement(
    tag,
    className,
    text
  ){
    const el=
      document.createElement(tag);

    if(className){
      el.className=className;
    }

    el.textContent=text;

    return el;
  }


  function starsHref(event){

    const xy=
      event &&
      event.sky &&
      event.sky.generalXY;

    if(
      !xy ||
      !Number.isFinite(Number(xy.x)) ||
      !Number.isFinite(Number(xy.y))
    ){
      return null;
    }

    const url=
      new URL(STARS_URL);

    url.searchParams.set(
      'x',
      String(xy.x)
    );

    url.searchParams.set(
      'y',
      String(xy.y)
    );

    url.searchParams.set(
      'event',
      String(
        event.detailAnchor ||
        event.id ||
        'event'
      )
    );

    url.searchParams.set(
      'title',
      String(
        event.title ||
        'A8 EVENT'
      )
    );

    return url.toString();
  }


  function addMeta(
    holder,
    value
  ){
    if(!value){
      return;
    }

    holder.appendChild(
      textElement(
        'span',
        '',
        value
      )
    );
  }


  function makeEventCard(
    event
  ){

    const card=
      document.createElement('article');

    card.className='a8-live-event-card';

    card.appendChild(
      textElement(
        'h3',
        '',
        event.title ||
        event.id ||
        'ASTRONOMICAL EVENT'
      )
    );


    const meta=
      document.createElement('div');

    meta.className='a8-live-meta';


    const a8=
      event.a8 || {};

    const publicDate=
      a8.publicDate || {};

    addMeta(
      meta,
      publicDate.display ||
      a8.quickDate ||
      (
        Number.isInteger(a8.yearDay)
          ? `YEAR DAY ${a8.yearDay}`
          : null
      )
    );


    if(
      a8.time &&
      a8.time.decimalHHMMSSApprox
    ){
      addMeta(
        meta,
        `A8 TIME · ${a8.time.decimalHHMMSSApprox}`
      );
    }


    if(
      a8.time &&
      a8.time.octalHHMMSSApprox
    ){
      addMeta(
        meta,
        a8.time.octalHHMMSSApprox
      );
    }


    if(event.precisionClass){
      addMeta(
        meta,
        `PRECISION · ${event.precisionClass}`
      );
    }


    const xy=
      event.sky &&
      event.sky.generalXY;

    if(xy){
      addMeta(
        meta,
        xy.decimal ||
        `X ${xy.x} · Y ${xy.y}`
      );

      if(xy.octal){
        addMeta(
          meta,
          xy.octal
        );
      }
    }


    card.appendChild(meta);


    if(event.summary){
      card.appendChild(
        textElement(
          'p',
          'a8-live-summary',
          event.summary
        )
      );
    }


    const href=
      starsHref(event);

    if(href){

      const link=
        document.createElement('a');

      link.className='a8-stars-link';
      link.href=href;

      /*
       * Same-tab handoff:
       * EVENTS explains WHAT/WHEN.
       * STARS becomes WHERE.
       */
      link.textContent=
        'VIEW EVENT POSITION ON A8 STARS →';

      card.appendChild(link);
    }


    return card;
  }


  function makeGroup(
    className,
    headingClass,
    headingText,
    events
  ){

    const section=
      document.createElement('section');

    section.className=className;

    section.appendChild(
      textElement(
        'h2',
        headingClass,
        headingText
      )
    );

    for(const event of events){
      section.appendChild(
        makeEventCard(event)
      );
    }

    return section;
  }


  function selectedAnchor(){

    const raw=
      window.location.hash
        ? window.location.hash.slice(1)
        : '';

    if(!raw){
      return '';
    }

    try{
      return decodeURIComponent(raw);
    }catch(_){
      return raw;
    }
  }


  async function load(){

    root.textContent=
      'LOCATING NEXT A8 EVENT…';

    try{

      const [
        calendarResponse,
        eventsResponse
      ]=
        await Promise.all([
          fetch(
            CALENDAR_URL,
            {
              cache:'no-store',
              mode:'cors'
            }
          ),
          fetch(
            EVENTS_URL,
            {
              cache:'no-store'
            }
          )
        ]);


      if(!calendarResponse.ok){
        throw new Error(
          `CALENDAR HTTP ${calendarResponse.status}`
        );
      }

      if(!eventsResponse.ok){
        throw new Error(
          `EVENTS HTTP ${eventsResponse.status}`
        );
      }


      const calendarDocument=
        await calendarResponse.json();

      const eventsDocument=
        await eventsResponse.json();

      const calendar=
        calendarDocument.calendar;

      const events=
        eventsDocument.events;


      if(
        !calendar ||
        !Number.isInteger(
          calendar.yearCycle4
        ) ||
        !Number.isInteger(
          calendar.yearDay
        )
      ){
        throw new Error(
          'CALENDAR STATE INCOMPLETE'
        );
      }

      if(!Array.isArray(events)){
        throw new Error(
          'EVENT REGISTER INCOMPLETE'
        );
      }


      const cycle=
        calendar.yearCycle4;

      const today=
        calendar.yearDay;


      const eligible=
        events.filter(
          event=>
            event &&
            event.a8 &&
            event.a8.yearCycle4===cycle &&
            Number.isInteger(
              event.a8.yearDay
            ) &&
            event.a8.yearDay>=today
        );


      root.replaceChildren();


      root.appendChild(
        textElement(
          'div',
          'a8-live-state',
          `CORE20 CALENDAR · CYCLE ${calendar.yearCycleLabel || cycle} · YEAR DAY ${today}`
        )
      );


      let nextGroup=[];
      let nextDay=null;


      if(eligible.length){

        nextDay=
          Math.min(
            ...eligible.map(
              event=>event.a8.yearDay
            )
          );

        nextGroup=
          eligible.filter(
            event=>
              event.a8.yearDay===nextDay
          );


        root.appendChild(
          makeGroup(
            'a8-next-group',
            'a8-next-heading',
            nextGroup.length===1
              ? `NEXT ★ · YEAR DAY ${nextDay}`
              : `NEXT ★ · YEAR DAY ${nextDay} · ${nextGroup.length} EVENTS`,
            nextGroup
          )
        );

      }else{

        root.appendChild(
          textElement(
            'div',
            'a8-events-live-error',
            'NO LATER CATALOGUED EVENT IN THE CURRENT REGISTER CYCLE'
          )
        );
      }


      const anchor=
        selectedAnchor();

      const selected=
        anchor
          ? events.find(
              event=>
                event &&
                (
                  event.id===anchor ||
                  event.detailAnchor===anchor
                )
            )
          : null;


      const selectedAlreadyNext=
        selected &&
        nextGroup.some(
          event=>
            event.id===selected.id
        );


      if(
        selected &&
        !selectedAlreadyNext
      ){

        const selectedSection=
          makeGroup(
            'a8-calendar-selected',
            'a8-selected-heading',
            'FROM CALENDAR ★',
            [selected]
          );

        selectedSection.id=
          'a8CalendarSelectedEvent';

        root.appendChild(
          selectedSection
        );

        selectedSection.scrollIntoView({
          block:'start'
        });

      }else if(
        selected &&
        selectedAlreadyNext
      ){

        root
          .querySelector('.a8-next-group')
          ?.scrollIntoView({
            block:'start'
          });
      }


      console.info(
        'A8 Events NEXT',
        {
          cycle,
          today,
          nextDay,
          count:nextGroup.length
        }
      );


    }catch(error){

      root.replaceChildren();

      root.appendChild(
        textElement(
          'div',
          'a8-events-live-error',
          `NEXT EVENT UNAVAILABLE · ${error.message || error}`
        )
      );

      console.warn(
        'A8 Events NEXT failed',
        error
      );
    }
  }


  load();

})();
