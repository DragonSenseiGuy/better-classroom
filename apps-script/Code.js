const SECRET_PROPERTY = 'CLASSROOM_SYNC_KEY';
const CACHE_TTL = 6 * 60 * 60;

function doGet(e) {
	const params = (e && e.parameter) || {};
	const expected = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY);
	if (!expected || params.key !== expected) return respond({ error: 'unauthorized' }, 401);
	try {
		const since = params.since ? Number(params.since) : 0;
		if (params.course) return respond(courseContent(params.course, since));
		return respond(overview(since));
	} catch (err) {
		return respond({ error: String(err && err.message ? err.message : err) }, 500);
	}
}

function overview(since) {
	const me = cached('profile', () => {
		const p = Classroom.UserProfiles.get('me');
		return {
			id: p.id,
			name: p.name && p.name.fullName,
			email: p.emailAddress,
			photoUrl: absolute(p.photoUrl)
		};
	});
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
	return {
		profile: me,
		courses: courses.map((c) => ({
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
			updateTime: c.updateTime,
			teachers: since ? cached('teachers:' + c.id, () => teachers(c.id)) : teachers(c.id)
		}))
	};
}

function teachers(courseId) {
	try {
		return paginate(
			(token) => Classroom.Courses.Teachers.list(courseId, { pageSize: 100, pageToken: token }),
			'teachers'
		).map((t) => ({
			userId: t.userId,
			name: t.profile && t.profile.name && t.profile.name.fullName,
			email: t.profile && t.profile.emailAddress,
			photoUrl: absolute(t.profile && t.profile.photoUrl)
		}));
	} catch (err) {
		return [];
	}
}

function courseContent(courseId, since) {
	const partial = since > 0;
	const courseWork = paginateSince(
		(token) =>
			Classroom.Courses.CourseWork.list(courseId, {
				courseWorkStates: ['PUBLISHED'],
				orderBy: 'updateTime desc',
				pageSize: 100,
				pageToken: token
			}),
		'courseWork',
		since
	);
	const materials = paginateSince(
		(token) =>
			Classroom.Courses.CourseWorkMaterials.list(courseId, {
				courseWorkMaterialStates: ['PUBLISHED'],
				orderBy: 'updateTime desc',
				pageSize: 100,
				pageToken: token
			}),
		'courseWorkMaterial',
		since
	);
	const announcements = paginateSince(
		(token) =>
			Classroom.Courses.Announcements.list(courseId, {
				announcementStates: ['PUBLISHED'],
				orderBy: 'updateTime desc',
				pageSize: 100,
				pageToken: token
			}),
		'announcements',
		since
	);
	const topics = partial
		? cached('topics:' + courseId, () => listTopics(courseId))
		: listTopics(courseId);
	const submissions = paginate(
		(token) =>
			Classroom.Courses.CourseWork.StudentSubmissions.list(courseId, '-', {
				userId: 'me',
				pageSize: 100,
				pageToken: token
			}),
		'studentSubmissions'
	);
	return {
		partial: partial,
		courseWork: courseWork.map(slimCourseWork),
		materials: materials.map(slimMaterial),
		announcements: announcements.map(slimAnnouncement),
		topics: topics,
		submissions: submissions.map(slimSubmission)
	};
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

function paginate(fetchPage, key) {
	const out = [];
	let token;
	do {
		const page = fetchPage(token) || {};
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
		const page = fetchPage(token) || {};
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
	const hit = cache.get(key);
	if (hit) return JSON.parse(hit);
	const value = compute();
	cache.put(key, JSON.stringify(value), CACHE_TTL);
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
