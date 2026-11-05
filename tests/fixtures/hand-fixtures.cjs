function hand(label, x, gap = 1.22, y = .5) {
  const points = Array.from({ length: 21 }, (_, i) => ({ x: x + (i % 4 - 1.5) * .025, y: y - Math.floor(i / 4) * .025, z: 0 }));
  points[0] = { x, y: y + .08, z: 0 };
  points[9] = { x, y: y - .08, z: 0 };
  points[5] = { x: x - .065, y, z: 0 };
  points[17] = { x: x + .065, y, z: 0 };
  points[4] = { x: x - .02, y: y - .09, z: 0 };
  points[8] = { x: x - .02 + .13 * gap, y: y - .09, z: 0 };
  return { label, points };
}

function numberHand(pose, x = .72, { angle = 0, scale = 1, label = 'Left', confidence = .98 } = {}) {
  const positions = Array.from({ length: 21 }, () => [0, 0]);
  positions[0] = [0, .15];
  positions[1] = [-.04, .10];
  positions[2] = [-.08, .07];
  positions[3] = [-.105, .03];
  positions[4] = [-.125, -.01];
  const bases = [[5, -.06, 0, .16], [9, -.02, -.02, .18], [13, .025, -.01, .16], [17, .065, .015, .12]];
  bases.forEach(([base, dx, dy, length], index) => {
    const extended = pose === 'open' || typeof pose === 'number' && index < pose;
    positions[base] = [dx, dy];
    positions[base + 1] = [dx, dy - length * (extended ? .46 : .30)];
    positions[base + 2] = extended ? [dx, dy - length * .75] : [dx + .009, dy - .008];
    positions[base + 3] = extended ? [dx, dy - length] : [dx + .006, dy + .035];
  });
  if (pose === 'uncertain') {
    positions[6] = [-.06, -.07];
    positions[7] = [-.02, -.10];
    positions[8] = [.02, -.13];
  }
  const radians = angle * Math.PI / 180;
  const points = positions.map(([dx, dy]) => ({
    x: x + scale * (dx * 4 / 3 * Math.cos(radians) - dy * Math.sin(radians)) / (4 / 3),
    y: .5 + scale * (dx * 4 / 3 * Math.sin(radians) + dy * Math.cos(radians)), z: 0
  }));
  return { label, confidence, points };
}

module.exports = { hand, numberHand };
