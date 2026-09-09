import confetti from 'canvas-confetti';

export function celebrate() {
	const end = Date.now() + 1200;
	const colors = ['#7dd3fc', '#fcd34d', '#6ee7b7', '#fda4af', '#c4b5fd', '#f9a8d4'];
	const frame = () => {
		confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors });
		confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors });
		if (Date.now() < end) requestAnimationFrame(frame);
	};
	confetti({ particleCount: 120, spread: 90, startVelocity: 40, origin: { y: 0.6 }, colors });
	frame();
	chime();
}

function chime() {
	const Ctx =
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Ctx) return;
	const ctx = new Ctx();
	const notes = [523.25, 659.25, 783.99, 1046.5];
	const master = ctx.createGain();
	master.gain.value = 0.18;
	master.connect(ctx.destination);
	notes.forEach((freq, i) => {
		const t = ctx.currentTime + i * 0.12;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'triangle';
		osc.frequency.value = freq;
		gain.gain.setValueAtTime(0, t);
		gain.gain.linearRampToValueAtTime(1, t + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
		osc.connect(gain).connect(master);
		osc.start(t);
		osc.stop(t + 1);
	});
	setTimeout(() => void ctx.close(), 2000);
}
