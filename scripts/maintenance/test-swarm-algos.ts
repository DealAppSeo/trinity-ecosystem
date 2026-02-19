/**
 * Test Swarm Algorithms (PSO, ACO, ABC)
 */
import { PSO, ACO, ABC } from '../../lib/science/SwarmAlgorithms';

console.log('--- Testing PSO ---');
const pso = new PSO(20, 2, (pos) => -(Math.pow(pos[0] - 0.5, 2) + Math.pow(pos[1] - 0.5, 2))); // Maximize at (0.5, 0.5)
for (let i = 0; i < 50; i++) pso.step();
const psoResult = pso.getBest();
console.log('PSO Best Position:', psoResult.position, 'Fitness:', psoResult.fitness);

console.log('\n--- Testing ACO ---');
const aco = new ACO(5);
const distances = [
    [0, 10, 15, 20, 25],
    [10, 0, 35, 25, 30],
    [15, 35, 0, 30, 20],
    [20, 25, 30, 0, 15],
    [25, 30, 20, 15, 0]
];
const probs = aco.calculateProbabilities(0, [1, 2, 3, 4], distances);
console.log('ACO Probabilities from node 0:', probs);

console.log('\n--- Testing ABC ---');
const abc = new ABC(20, 2, (x) => Math.pow(x[0] - 0.5, 2) + Math.pow(x[1] - 0.5, 2)); // Minimize at (0.5, 0.5)
for (let i = 0; i < 50; i++) abc.step();
const abcResult = abc.getBest();
console.log('ABC Best Source:', abcResult.source, 'Fitness:', abcResult.fitness);
