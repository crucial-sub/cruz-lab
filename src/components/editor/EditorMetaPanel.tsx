interface EditorMetaPanelProps {
  title: string;
  content: string;
  slug: string;
  setSlug: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  isPublic: boolean;
  setIsPublic: (value: boolean) => void;
  tagCount: number;
  hasHeroImage: boolean;
  readingTime: number;
}

function buildReadinessItems({
  title,
  slug,
  description,
  tagCount,
  hasHeroImage,
}: Pick<EditorMetaPanelProps, 'title' | 'slug' | 'description' | 'tagCount' | 'hasHeroImage'>) {
  return [
    {
      id: 'title',
      label: '제목',
      ready: title.trim().length > 0,
      helper: title.trim().length > 0 ? '입력됨' : '제목이 비어 있습니다.',
    },
    {
      id: 'slug',
      label: 'URL',
      ready: slug.trim().length > 0,
      helper: slug.trim().length > 0 ? `/blog/${slug}` : 'slug를 먼저 확인해야 합니다.',
    },
    {
      id: 'description',
      label: '설명',
      ready: description.trim().length >= 30,
      helper:
        description.trim().length >= 30
          ? `${description.trim().length}/150`
          : '설명을 조금 더 채우면 카드와 미리보기가 안정적입니다.',
    },
    {
      id: 'tags',
      label: '태그',
      ready: tagCount > 0,
      helper: tagCount > 0 ? `${tagCount}개 선택됨` : '태그가 없으면 분류가 약해집니다.',
    },
    {
      id: 'hero',
      label: '썸네일',
      ready: hasHeroImage,
      helper: hasHeroImage ? '준비됨' : '썸네일은 출간 모달에서 올릴 수 있습니다.',
    },
  ];
}

export function EditorMetaPanel({
  title,
  content,
  slug,
  setSlug,
  description,
  setDescription,
  isPublic,
  setIsPublic,
  tagCount,
  hasHeroImage,
  readingTime,
}: EditorMetaPanelProps) {
  const readinessItems = buildReadinessItems({
    title,
    slug,
    description,
    tagCount,
    hasHeroImage,
  });
  const readyCount = readinessItems.filter((item) => item.ready).length;
  const autoDescription = content
    .substring(0, 150)
    .replace(/[#*`>\-\[\]]/g, '')
    .replace(/\n+/g, ' ')
    .trim();

  return (
    <section className="mb-6 rounded-2xl border border-gray-100 bg-gray-50/80 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
            Publish Readiness
          </p>
          <h2 className="mt-2 text-lg font-semibold text-gray-900">
            출간 전에 확인할 정보
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            지금 상태에서 {readyCount}/{readinessItems.length} 항목이 준비됐습니다.
          </p>
        </div>
        <div className="rounded-xl bg-white px-4 py-3 text-sm text-gray-600 shadow-sm ring-1 ring-gray-100">
          <div>예상 읽기 시간 · {readingTime}분</div>
          <div className="mt-1">
            공개 상태 · <span className={isPublic ? 'text-emerald-600' : 'text-amber-600'}>
              {isPublic ? '전체 공개' : '비공개'}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {readinessItems.map((item) => (
          <div
            key={item.id}
            className={`rounded-xl border px-4 py-3 ${
              item.ready
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">{item.label}</span>
              <span className="text-xs font-medium">
                {item.ready ? '준비됨' : '확인 필요'}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 opacity-80">{item.helper}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr,1.3fr,0.9fr]">
        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-700">URL slug</span>
          <div className="flex items-center rounded-xl border border-gray-200 bg-white px-3 py-2">
            <span className="text-sm text-gray-400">/blog/</span>
            <input
              type="text"
              value={slug}
              onChange={(event) =>
                setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9가-힣-]/g, ''))
              }
              placeholder="포스트-제목"
              className="flex-1 bg-transparent text-sm text-gray-900 focus:outline-none"
            />
          </div>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-700">포스트 설명</span>
          <div className="space-y-2">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value.substring(0, 150))}
              placeholder="포스트를 짧게 소개해보세요"
              rows={4}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand focus:outline-none"
            />
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{description.length}/150</span>
              <button
                type="button"
                onClick={() => setDescription(autoDescription)}
                className="font-medium text-brand hover:underline"
              >
                본문으로 자동 채우기
              </button>
            </div>
          </div>
        </label>

        <div className="space-y-2">
          <span className="text-sm font-medium text-gray-700">공개 설정</span>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setIsPublic(true)}
              className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                isPublic
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              }`}
            >
              전체 공개
            </button>
            <button
              type="button"
              onClick={() => setIsPublic(false)}
              className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                !isPublic
                  ? 'border-amber-500 bg-amber-50 text-amber-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              }`}
            >
              비공개
            </button>
          </div>
          <p className="text-xs leading-5 text-gray-400">
            썸네일 업로드와 최종 미리보기는 출간 모달에서 계속 처리합니다.
          </p>
        </div>
      </div>
    </section>
  );
}
