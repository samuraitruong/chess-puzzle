import axios from "axios";
import asyncPool from "tiny-async-pool";
import { Sample } from "./data/sample.mjs";
import axiosRetry from "axios-retry";
import fs from "fs-extra";

axiosRetry(axios, {
  retries: 10,
  onRetry: (c, err, config) => {
    console.warn("Retrying request", error);
  },
  retryDelay: (retryCount) => {
    return retryCount * 2000;
  },
});

async function asyncPoolAll(...args) {
  const results = [];
  for await (const result of asyncPool(...args)) {
    results.push(result);
  }
  return results;
}

function generateFen(item) {
  const fen = [];
  const board = [];
  let player = "w";

  const startPos = item.solution.match(/1\.+([^-\*]*)/i);
  if (!item.algebraic || !item.algebraic.black || !item.algebraic.white) {
    return "NA";
  }
  if (item.algebraic.black.some((x) => x.includes(startPos))) {
    player = "b";
  }

  const pieces = [
    ...item.algebraic.white.map((x) => x.replace("S", "N")),
    ...item.algebraic.black.map((x) => x.replace("S", "N").toLowerCase()),
  ];
  for (var i = 1; i <= 8; i++) {
    const row = [];
    board.push(row);
    let rowFen = "";
    let blankCount = 0;
    for (let j = 1; j <= 8; j++) {
      const pos = String.fromCharCode(96 + j);
      const cellName = pos + i;
      const peice = pieces.find((x) => x.includes(cellName)) || "";
      if (peice) {
        if (blankCount > 0) {
          rowFen += blankCount;
        }
        rowFen += peice[0];
        blankCount = 0;
      } else {
        blankCount++;
      }
      row.push(peice);
    }
    if (blankCount > 0) {
      rowFen += blankCount;
    }

    fen.push(rowFen);
  }
  return (
    fen.reverse().join("/") +
    " " +
    player +
    "  - - " +
    "  https://www.yacpdb.org/#" +
    item.id
  );
}

async function getById(item) {
  const start = new Date().getTime();
  console.log("Process Item #", item.id);
  const result = await axios.get(
    "https://www.yacpdb.org/json.php?entry&rev=" + item.id
  );
  const final = result.data;
  final.fen = generateFen(final);

  console.log(
    "Processed Item #",
    item.id,
    final.fen,
    new Date().getTime() - start
  );
  return final;
}

function populateFen(item) {
  item.fen = generateFen(item);
  return item;
}

async function fetchAllPage() {
  const pageCount = 5601;
  const totalPages = new Array(pageCount).fill(0).map((x, index) => index + 1);
  const fetchPage = async (index) => {
    try {
      const start = new Date().getTime();
      console.log("Processing page #", index);
      const page = await axios.get(
        "https://www.yacpdb.org/json.php?search&query&page=" + index
      );
      const data = await asyncPoolAll(50, page.data.entries, populateFen);

      console.log(
        "Finished page #",
        index,
        new Date().getTime() - start + "ms",
        data.length
      );
      return data.map((x) => x.fen);
    } catch (err) {
      console.error("Unable to fetch page", index);
    }
    return [];
  };

  const allFen = await asyncPoolAll(10, totalPages, fetchPage);

  console.log(allFen);
  fs.writeFileSync("data/puzzle.txt", allFen.flatMap((x) => x).join("\r\n"));
}
async function main() {
  await fetchAllPage();
}

main();
// console.log(generateFen(Sample));
