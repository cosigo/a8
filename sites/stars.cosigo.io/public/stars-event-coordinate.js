/* A8 STARS EVENT COORDINATE v1 */
(()=>{
  'use strict';

  const params=
    new URLSearchParams(
      window.location.search
    );

  if(
    !params.has('x') ||
    !params.has('y')
  ){
    return;
  }


  const x=
    Number(
      params.get('x')
    );

  const y=
    Number(
      params.get('y')
    );


  if(
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x<0 ||
    x>512 ||
    y<0 ||
    y>256
  ){
    console.warn(
      'A8 Stars event coordinate rejected',
      {x,y}
    );
    return;
  }


  const sky=
    document.getElementById('sky');

  const wrap=
    document.getElementById('skywrap');

  const plot=
    sky &&
    sky.querySelector('.plot-bg');


  if(
    !sky ||
    !wrap ||
    !plot
  ){
    console.warn(
      'A8 Stars plot geometry unavailable'
    );
    return;
  }


  const plotX=
    Number(
      plot.getAttribute('x')
    );

  const plotY=
    Number(
      plot.getAttribute('y')
    );

  const plotW=
    Number(
      plot.getAttribute('width')
    );

  const plotH=
    Number(
      plot.getAttribute('height')
    );


  if(
    ![
      plotX,
      plotY,
      plotW,
      plotH
    ].every(Number.isFinite)
  ){
    return;
  }


  /*
   * A8 celestial longitude increases toward
   * the LEFT on this sheet:
   *
   * X 0   = right seam
   * X 512 = left seam
   *
   * A8 celestial latitude:
   *
   * Y 0   = north
   * Y 128 = equator
   * Y 256 = south
   */

  const px=
    plotX +
    (1-(x/512))*plotW;

  const py=
    plotY +
    (y/256)*plotH;


  const NS=
    'http://www.w3.org/2000/svg';

  const group=
    document.createElementNS(
      NS,
      'g'
    );

  group.id=
    'a8EventCoordinateMarker';


  const ring=
    document.createElementNS(
      NS,
      'circle'
    );

  ring.setAttribute('cx',px);
  ring.setAttribute('cy',py);
  ring.setAttribute('r',9);
  ring.setAttribute(
    'class',
    'a8-event-coordinate-ring'
  );


  const horizontal=
    document.createElementNS(
      NS,
      'line'
    );

  horizontal.setAttribute('x1',px-13);
  horizontal.setAttribute('x2',px+13);
  horizontal.setAttribute('y1',py);
  horizontal.setAttribute('y2',py);
  horizontal.setAttribute(
    'class',
    'a8-event-coordinate-cross'
  );


  const vertical=
    document.createElementNS(
      NS,
      'line'
    );

  vertical.setAttribute('x1',px);
  vertical.setAttribute('x2',px);
  vertical.setAttribute('y1',py-13);
  vertical.setAttribute('y2',py+13);
  vertical.setAttribute(
    'class',
    'a8-event-coordinate-cross'
  );


  const core=
    document.createElementNS(
      NS,
      'circle'
    );

  core.setAttribute('cx',px);
  core.setAttribute('cy',py);
  core.setAttribute('r',2.2);
  core.setAttribute(
    'class',
    'a8-event-coordinate-core'
  );


  group.append(
    ring,
    horizontal,
    vertical,
    core
  );

  sky.appendChild(group);


  const title=
    params.get('title') ||
    params.get('event') ||
    'ASTRONOMICAL EVENT';


  const notice=
    document.createElement('div');

  notice.className=
    'a8-event-coordinate-notice';

  notice.textContent=
    `EVENT POSITION ★ · ${title} · X ${x} · Y ${y}`;


  wrap.before(notice);


  /*
   * The event marker is presentation only.
   * Existing catalog-star selection and
   * great-circle arc measurement are untouched.
   */

  console.info(
    'A8 Stars event coordinate',
    {
      title,
      x,
      y,
      px,
      py
    }
  );

})();
