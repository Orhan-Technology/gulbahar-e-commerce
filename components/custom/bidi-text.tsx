import { Fragment } from 'react';

/*
 * A run of Latin script inside otherwise Dari text: "A54", "iPhone", "5G".
 *
 * Digits are only picked up when they FOLLOW a letter, so a Latin model number
 * is caught whole while a standalone number is left alone — the locale's own
 * digits are already correct and wrapping them would isolate them from the
 * Persian text they belong to.
 */
const LATIN_RUN = /([A-Za-z][A-Za-z0-9]*(?:[-+./][A-Za-z0-9]+)*)/g;

/**
 * Isolates Latin tokens inside bidirectional text.
 *
 * «سامسونگ گلکسی ۱۲۸ A54 گیگابایت» is one string in three scripts, and the
 * bidi algorithm resolves the neutral characters around "A54" against whatever
 * happens to sit beside them after wrapping — which is how a card title ends up
 * breaking around the Latin token and leaving it stranded on a line of its own.
 * `<bdi>` gives each Latin run its own embedding so its position is decided by
 * the markup rather than by where the line happened to break.
 *
 * NOT a `'use client'` module: card titles are rendered on both sides of the
 * RSC boundary and this has to be importable from either.
 */
export function BidiText({ text }: { text: string }) {
  const parts = text.split(LATIN_RUN);

  return (
    <>
      {parts.map((part, index) =>
        // split() with one capture group alternates: plain, captured, plain…
        index % 2 === 1 ? <bdi key={index}>{part}</bdi> : <Fragment key={index}>{part}</Fragment>,
      )}
    </>
  );
}
