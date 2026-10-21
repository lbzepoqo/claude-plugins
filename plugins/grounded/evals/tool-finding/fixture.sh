#!/usr/bin/env bash
set -euo pipefail
cat > orders.csv <<'CSV'
id,customer,amount
1001,Harbor Supply,120.00
1002,Lindqvist AB,45.50
1003,Northgate Ltd,300.00
1004,Okafor & Sons,80.25
1005,Pereira Imports,99.75
CSV
cat > report.js <<'JS'
const fs = require('fs')

function readOrders(path) {
  const lines = fs.readFileSync(path, 'utf8').trim().split('\n')
  return lines.slice(1).map(line => {
    const [id, customer, amount] = line.split(',')
    return { id, customer, amount: Number(amount) }
  })
}

function total(orders) {
  let sum = 0
  for (let i = 0; i < orders.length - 1; i++) {
    sum += orders[i].amount
  }
  return sum
}

const orders = readOrders('orders.csv')
fs.writeFileSync(`report-${process.argv[2]}.txt`, `Orders: ${orders.length}\nTotal: ${total(orders).toFixed(2)}\n`)
JS
printf 'Orders: 5\nTotal: 545.75\n' > report-2026-10-19.txt
