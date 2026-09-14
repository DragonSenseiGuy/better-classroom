const KEY = '';
const SECRET_PROPERTY = 'CLASSROOM_SYNC_KEY';
const CACHE_TTL = 6 * 60 * 60;
const RETRIES = 3;
const TRANSIENT =
	/quota|rate ?limit|429|5\d\d|internal|backend|unavailable|timeout|timed out|try again/i;

function doGet(e) {
	const params = (e && e.parameter) || {};
	const expected = KEY || PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY);
	if (!expected || params.key !== expected) return respond({ error: 'unauthorized' }, 401);
	try {
		const since = params.since ? Number(params.since) : 0;
		if (params.ping) return respond(ping());
		if (params.action)
			return respond(
				submissionAction(params.action, params.course, params.work, params.submission)
			);
		if (params.course && params.lookup) return respond(lookup(params.course, params.users));
		if (params.course) return respond(courseContent(params.course, since, params.work !== '0'));
		return respond(overview(since));
	} catch (err) {
		return respond({ error: String(err && err.message ? err.message : err) }, 500);
	}
}

function profile() {
	return cached('profile', () => {
		const p = Classroom.UserProfiles.get('me');
		return slimProfile(p);
	});
}

function slimProfile(p) {
	return {
		id: p.id,
		name: p.name && p.name.fullName,
		email: p.emailAddress,
		photoUrl: absolute(p.photoUrl)
	};
}

function ping() {
	const me = profile();
	const page = Classroom.Courses.list({ studentId: 'me', courseStates: ['ACTIVE'], pageSize: 100 });
	return { ok: true, profile: me, courseCount: (page.courses || []).length };
}

function overview(since) {
	const me = profile();
	const courses = paginate(
		(token) =>
			Classroom.Courses.list({
				studentId: 'me',
				courseStates: ['ACTIVE'],
				pageSize: 100,
				pageToken: token
			}),
		'courses'
	);
	const errors = {};
	return {
		profile: me,
		courses: courses.map((c) => {
			const course = {
				id: c.id,
				name: c.name,
				section: c.section,
				descriptionHeading: c.descriptionHeading,
				description: c.description,
				room: c.room,
				ownerId: c.ownerId,
				courseState: c.courseState,
				alternateLink: c.alternateLink,
				calendarId: c.calendarId,
				creationTime: c.creationTime,
				updateTime: c.updateTime
			};
			if (!since) {
				const teachers = attempt(errors, 'teachers:' + c.id, () => listTeachers(c.id));
				if (teachers) course.teachers = teachers;
			}
			return course;
		}),
		errors: errors
	};
}

function listTeachers(courseId) {
	return paginate(
		(token) => Classroom.Courses.Teachers.list(courseId, { pageSize: 100, pageToken: token }),
		'teachers'
	).map((t) => ({
		userId: t.userId,
		name: t.profile && t.profile.name && t.profile.name.fullName,
		email: t.profile && t.profile.emailAddress,
		photoUrl: absolute(t.profile && t.profile.photoUrl)
	}));
}

function lookup(courseId, users) {
	const errors = {};
	const out = { errors: errors };
	const teachers = attempt(errors, 'teachers', () => listTeachers(courseId));
	if (teachers) out.teachers = teachers;
	const topics = attempt(errors, 'topics', () => listTopics(courseId));
	if (topics) out.topics = topics;
	const known = {};
	(teachers || []).forEach((t) => (known[t.userId] = true));
	out.people = String(users || '')
		.split(',')
		.filter((id) => id && !known[id])
		.map((id) => attempt(errors, 'user:' + id, () => slimProfile(Classroom.UserProfiles.get(id))))
		.filter(Boolean)
		.map((p) => ({ userId: p.id, name: p.name, email: p.email, photoUrl: p.photoUrl }));
	return out;
}

function courseContent(courseId, since, wantSubmissions) {
	const partial = since > 0;
	const errors = {};
	const out = { partial: partial, errors: errors };
	const courseWork = attempt(errors, 'courseWork', () =>
		paginateSince(
			(token) =>
				Classroom.Courses.CourseWork.list(courseId, {
					courseWorkStates: ['PUBLISHED'],
					orderBy: 'updateTime desc',
					pageSize: 100,
					pageToken: token
				}),
			'courseWork',
			since
		)
	);
	if (courseWork) out.courseWork = courseWork.map(slimCourseWork);
	const materials = attempt(errors, 'materials', () =>
		paginateSince(
			(token) =>
				Classroom.Courses.CourseWorkMaterials.list(courseId, {
					courseWorkMaterialStates: ['PUBLISHED'],
					orderBy: 'updateTime desc',
					pageSize: 100,
					pageToken: token
				}),
			'courseWorkMaterial',
			since
		)
	);
	if (materials) out.materials = materials.map(slimMaterial);
	const announcements = attempt(errors, 'announcements', () =>
		paginateSince(
			(token) =>
				Classroom.Courses.Announcements.list(courseId, {
					announcementStates: ['PUBLISHED'],
					orderBy: 'updateTime desc',
					pageSize: 100,
					pageToken: token
				}),
			'announcements',
			since
		)
	);
	if (announcements) out.announcements = announcements.map(slimAnnouncement);
	if (!partial) {
		const topics = attempt(errors, 'topics', () => listTopics(courseId));
		if (topics) out.topics = topics;
	}
	if (wantSubmissions || (courseWork && courseWork.length > 0)) {
		const submissions = attempt(errors, 'submissions', () =>
			paginate(
				(token) =>
					Classroom.Courses.CourseWork.StudentSubmissions.list(courseId, '-', {
						userId: 'me',
						pageSize: 100,
						pageToken: token
					}),
				'studentSubmissions'
			)
		);
		if (submissions) out.submissions = submissions.map(slimSubmission);
	}
	return out;
}

function submissionAction(action, courseId, workId, submissionId) {
	if (!courseId || !workId || !submissionId)
		throw new Error('course, work and submission are required');
	const api = Classroom.Courses.CourseWork.StudentSubmissions;
	if (action === 'turnIn') withRetry(() => api.turnIn({}, courseId, workId, submissionId));
	else if (action === 'reclaim') withRetry(() => api.reclaim({}, courseId, workId, submissionId));
	else throw new Error('unknown action ' + action);
	return { submission: slimSubmission(withRetry(() => api.get(courseId, workId, submissionId))) };
}

function listTopics(courseId) {
	return paginate(
		(token) => Classroom.Courses.Topics.list(courseId, { pageSize: 100, pageToken: token }),
		'topic'
	).map((t) => ({
		id: t.topicId,
		name: t.name,
		updateTime: t.updateTime
	}));
}

function slimCourseWork(w) {
	return {
		id: w.id,
		title: w.title,
		description: w.description,
		materials: (w.materials || []).map(slimAttachment),
		state: w.state,
		alternateLink: w.alternateLink,
		creationTime: w.creationTime,
		updateTime: w.updateTime,
		dueDate: w.dueDate,
		dueTime: w.dueTime,
		maxPoints: w.maxPoints,
		workType: w.workType,
		topicId: w.topicId,
		creatorUserId: w.creatorUserId,
		submissionModificationMode: w.submissionModificationMode
	};
}

function slimMaterial(m) {
	return {
		id: m.id,
		title: m.title,
		description: m.description,
		materials: (m.materials || []).map(slimAttachment),
		alternateLink: m.alternateLink,
		creationTime: m.creationTime,
		updateTime: m.updateTime,
		topicId: m.topicId,
		creatorUserId: m.creatorUserId
	};
}

function slimAnnouncement(a) {
	return {
		id: a.id,
		text: a.text,
		materials: (a.materials || []).map(slimAttachment),
		alternateLink: a.alternateLink,
		creationTime: a.creationTime,
		updateTime: a.updateTime,
		creatorUserId: a.creatorUserId
	};
}

function slimSubmission(s) {
	const attachments = ((s.assignmentSubmission && s.assignmentSubmission.attachments) || []).map(
		slimAttachment
	);
	return {
		id: s.id,
		courseWorkId: s.courseWorkId,
		state: s.state,
		late: !!s.late,
		draftGrade: s.draftGrade,
		assignedGrade: s.assignedGrade,
		alternateLink: s.alternateLink,
		courseWorkType: s.courseWorkType,
		creationTime: s.creationTime,
		updateTime: s.updateTime,
		attachments: attachments
	};
}

function slimAttachment(m) {
	if (m.driveFile) {
		const f = m.driveFile.driveFile || m.driveFile;
		return {
			type: 'drive',
			title: f.title,
			url: f.alternateLink,
			thumbnailUrl: f.thumbnailUrl,
			shareMode: m.driveFile.shareMode
		};
	}
	if (m.youtubeVideo)
		return {
			type: 'youtube',
			title: m.youtubeVideo.title,
			url: m.youtubeVideo.alternateLink,
			thumbnailUrl: m.youtubeVideo.thumbnailUrl
		};
	if (m.link)
		return {
			type: 'link',
			title: m.link.title,
			url: m.link.url,
			thumbnailUrl: m.link.thumbnailUrl
		};
	if (m.form)
		return {
			type: 'form',
			title: m.form.title,
			url: m.form.formUrl,
			thumbnailUrl: m.form.thumbnailUrl
		};
	return { type: 'unknown', title: '', url: '' };
}

function attempt(errors, key, compute) {
	try {
		return compute();
	} catch (err) {
		errors[key] = String(err && err.message ? err.message : err);
		return undefined;
	}
}

function withRetry(fn) {
	let delay = 1000;
	for (let i = 0; ; i++) {
		try {
			return fn();
		} catch (err) {
			const message = String(err && err.message ? err.message : err);
			if (i >= RETRIES - 1 || !TRANSIENT.test(message)) throw err;
			Utilities.sleep(delay);
			delay *= 2;
		}
	}
}

function paginate(fetchPage, key) {
	const out = [];
	let token;
	do {
		const page = withRetry(() => fetchPage(token)) || {};
		if (page[key]) Array.prototype.push.apply(out, page[key]);
		token = page.nextPageToken;
	} while (token);
	return out;
}

function paginateSince(fetchPage, key, since) {
	if (!since) return paginate(fetchPage, key);
	const out = [];
	let token;
	do {
		const page = withRetry(() => fetchPage(token)) || {};
		const items = page[key] || [];
		let stop = false;
		for (let i = 0; i < items.length; i++) {
			if (Date.parse(items[i].updateTime) < since) {
				stop = true;
				break;
			}
			out.push(items[i]);
		}
		if (stop) break;
		token = page.nextPageToken;
	} while (token);
	return out;
}

function cached(key, compute) {
	const cache = CacheService.getScriptCache();
	try {
		const hit = cache.get(key);
		if (hit) return JSON.parse(hit);
	} catch (err) {}
	const value = compute();
	const empty = value == null || (Array.isArray(value) && value.length === 0);
	if (!empty) {
		try {
			cache.put(key, JSON.stringify(value), CACHE_TTL);
		} catch (err) {}
	}
	return value;
}

function absolute(url) {
	if (!url) return undefined;
	return url.startsWith('//') ? 'https:' + url : url;
}

function respond(body, status) {
	const out = ContentService.createTextOutput(
		JSON.stringify(status ? Object.assign({ status: status }, body) : body)
	);
	out.setMimeType(ContentService.MimeType.JSON);
	return out;
}

function setSecret() {
	const key = Utilities.getUuid().replace(/-/g, '');
	PropertiesService.getScriptProperties().setProperty(SECRET_PROPERTY, key);
	Logger.log('APPS_SCRIPT_KEY=' + key);
}
