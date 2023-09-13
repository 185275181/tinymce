import { Arr, Cell, Optional } from '@ephox/katamari';
import { Compare, SugarElement, Traverse } from '@ephox/sugar';

import { createEntry, Entry } from './Entry';
import { isList } from './Util';

type Parser = (depth: number, itemSelection: Optional<ItemSelection>, selectionState: Cell<boolean>, element: SugarElement) => Entry[];

export interface ItemSelection {
  readonly start: SugarElement<HTMLElement>;
  readonly end: SugarElement<HTMLElement>;
}

export interface EntrySet {
  readonly entries: Entry[];
  readonly sourceList: SugarElement<HTMLElement>;
}

const parseSingleItem: Parser = (depth: number, itemSelection: Optional<ItemSelection>, selectionState: Cell<boolean>, item: SugarElement<HTMLElement>): Entry[] => {

  // Update selectionState (start)
  itemSelection.each((selection) => {
    if (Compare.eq(selection.start, item)) {
      selectionState.set(true);
    }
  });

  const currentItemEntry = createEntry(item, depth, selectionState.get());

  // Update selectionState (end)
  itemSelection.each((selection) => {
    if (Compare.eq(selection.end, item)) {
      selectionState.set(false);
    }
  });

  const childListEntries: Entry[] = Traverse.lastChild(item)
    .filter(isList)
    .map((list) => parseList(depth, itemSelection, selectionState, list))
    .getOr([]);

  return currentItemEntry.toArray().concat(childListEntries);
};

const parseItem: Parser = (depth: number, itemSelection: Optional<ItemSelection>, selectionState: Cell<boolean>, item: SugarElement<HTMLElement>): Entry[] =>
  Traverse.firstChild(item).filter(isList).fold(
    () => parseSingleItem(depth, itemSelection, selectionState, item),
    (list) => {
      if (Traverse.childNodesCount(item) === 1) {
        return parseList(depth, itemSelection, selectionState, list);
      } else {
        const result = parseList(depth, itemSelection, selectionState, list);
        const parsedSiblings = Arr.foldl(Traverse.children(item), (acc: Entry[], s, i) => {
          if (i === 0) {
            return acc;
          } else {
            const parsedSibling = parseSingleItem(depth, itemSelection, selectionState, s).map((e) => ({
              ...e,
              isInPreviousLi: true,
              listType: (s.dom.nodeName.toLowerCase() as any)
            }));
            return acc.concat(parsedSibling);
          }
        }, []);

        return result.concat(parsedSiblings);
      }
    });

const parseList: Parser = (depth: number, itemSelection: Optional<ItemSelection>, selectionState: Cell<boolean>, list: SugarElement<HTMLElement>): Entry[] =>
  Arr.bind(Traverse.children(list), (element) => {
    const parser = isList(element) ? parseList : parseItem;
    const newDepth = depth + 1;
    return parser(newDepth, itemSelection, selectionState, element);
  });

const parseLists = (lists: SugarElement<HTMLElement>[], itemSelection: Optional<ItemSelection>): EntrySet[] => {
  const selectionState = Cell(false);
  const initialDepth = 0;

  return Arr.map(lists, (list) => ({
    sourceList: list,
    entries: parseList(initialDepth, itemSelection, selectionState, list)
  }));
};

export { parseLists };
