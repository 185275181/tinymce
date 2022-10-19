import { StructureSchema } from '@ephox/boulder';
import { Arr, Fun, Optional, Optionals } from '@ephox/katamari';
import { Css, SugarLocation } from '@ephox/sugar';

import * as Boxes from '../../alien/Boxes';
import { AlloyComponent } from '../../api/component/ComponentApi';
import * as AriaFocus from '../../aria/AriaFocus';
import * as Anchor from '../../positioning/layout/Anchor';
import { PlacerResult } from '../../positioning/layout/LayoutTypes';
import * as Origins from '../../positioning/layout/Origins';
import * as Placement from '../../positioning/layout/Placement';
import * as SimpleLayout from '../../positioning/layout/SimpleLayout';
import { Anchoring } from '../../positioning/mode/Anchoring';
import { Transition } from '../../positioning/view/Transitions';
import { PlacementDetail, PlacementSpec, PositioningConfig, PositioningState } from './PositioningTypes';
import { PlacementSchema } from './PositionSchema';

const getFixedOrigin = (): Origins.OriginAdt => {
  // Don't use window.innerWidth/innerHeight here, as we don't want to include scrollbars
  // since the right/bottom position is based on the edge of the scrollbar not the window
  const html = document.documentElement;
  return Origins.fixed(0, 0, html.clientWidth, html.clientHeight);
};

const getRelativeOrigin = (component: AlloyComponent): Origins.OriginAdt => {
  const position = SugarLocation.absolute(component.element);
  const bounds = component.element.dom.getBoundingClientRect();

  // We think that this just needs to be kept consistent with Boxes.win. If we remove the scroll values from Boxes.win, we
  // should change this to just bounds.left and bounds.top from getBoundingClientRect
  return Origins.relative(position.left, position.top, bounds.width, bounds.height);
};

const place = (component: AlloyComponent, origin: Origins.OriginAdt, anchoring: Anchoring, optBounds: Optional<Boxes.Bounds>, placee: AlloyComponent, lastPlace: Optional<PlacerResult>, transition: Optional<Transition>): PlacerResult => {
  const anchor = Anchor.box(anchoring.anchorBox, origin);
  return SimpleLayout.simple(anchor, placee.element, anchoring.bubble, anchoring.layouts, lastPlace, optBounds, anchoring.overrides, transition);
};

const position = (component: AlloyComponent, posConfig: PositioningConfig, posState: PositioningState, placee: AlloyComponent, placementSpec: PlacementSpec): void => {
  const boundsBox = Optional.none();
  positionWithinBounds(component, posConfig, posState, placee, placementSpec, boundsBox);
};

const getOptConstrainedBounds = (optWithinBounds: Optional<Boxes.Bounds>, posConfig: PositioningConfig): Optional<Boxes.Bounds> => {
  const optConstrainingBounds: Optional<Boxes.Bounds> = posConfig.getBounds.map(Fun.apply);
  // If posConfig has a getBounds, then the final result cannot exceed those bounds.
  return optWithinBounds.fold(
    Fun.constant(optConstrainingBounds),
    (withinBounds: Boxes.Bounds) => optConstrainingBounds
      .map(
        (cb) => Boxes.constrain(withinBounds, cb)
      )
      .orThunk(() => optWithinBounds)
  );
};

const positionWithinBounds = (component: AlloyComponent, posConfig: PositioningConfig, posState: PositioningState, placee: AlloyComponent, placementSpec: PlacementSpec, optWithinBounds: Optional<Boxes.Bounds>): void => {
  const placeeDetail: PlacementDetail = StructureSchema.asRawOrDie('placement.info', StructureSchema.objOf(PlacementSchema), placementSpec);
  const anchorage = placeeDetail.anchor;
  const element = placee.element;
  const placeeState = posState.get(placee.uid);

  // Preserve the focus as IE 11 loses it when setting visibility to hidden
  AriaFocus.preserve(() => {
    // We set it to be fixed, so that it doesn't interfere with the layout of anything
    // when calculating anchors
    Css.set(element, 'position', 'fixed');

    const oldVisibility = Css.getRaw(element, 'visibility');
    Css.set(element, 'visibility', 'hidden');

    // We need to calculate the origin (esp. the bounding client rect) *after* we have done
    // all the preprocessing of the component and placee. Otherwise, the relative positions
    // (bottom and right) will be using the wrong dimensions
    const origin = posConfig.useFixed() ? getFixedOrigin() : getRelativeOrigin(component);

    const optBounds: Optional<Boxes.Bounds> = getOptConstrainedBounds(optWithinBounds, posConfig);

    anchorage.placement(component, anchorage, origin).each((anchoring) => {
      // Place the element and then update the state for the placee
      const newState = place(component, origin, anchoring, optBounds, placee, placeeState, placeeDetail.transition);
      posState.set(placee.uid, newState);
    });

    oldVisibility.fold(() => {
      Css.remove(element, 'visibility');
    }, (vis) => {
      Css.set(element, 'visibility', vis);
    });

    // We need to remove position: fixed put on by above code if it is not needed.
    if (
      Css.getRaw(element, 'left').isNone() &&
      Css.getRaw(element, 'top').isNone() &&
      Css.getRaw(element, 'right').isNone() &&
      Css.getRaw(element, 'bottom').isNone() &&
      Optionals.is(Css.getRaw(element, 'position'), 'fixed')
    ) {
      Css.remove(element, 'position');
    }
  }, element);
};

const getMode = (component: AlloyComponent, pConfig: PositioningConfig, _pState: PositioningState): string =>
  pConfig.useFixed() ? 'fixed' : 'absolute';

const reset = (component: AlloyComponent, pConfig: PositioningConfig, posState: PositioningState, placee: AlloyComponent): void => {
  const element = placee.element;
  Arr.each([ 'position', 'left', 'right', 'top', 'bottom' ], (prop) => Css.remove(element, prop));
  Placement.reset(element);
  posState.clear(placee.uid);
};

export {
  position,
  positionWithinBounds,
  getMode,
  reset
};
