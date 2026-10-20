
import { create } from "zustand";

const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY;
const YOUTUBE_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

// ======================================
// 공통 TMDB API
// ======================================

const fetchTMDB = async (url) => {
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.status_message || res.status);
    }

    return data;
};

export const useMovieStore = create((set, get) => ({
    // ======================================
    // 인기 영화
    // ======================================

    popMovies: [],

    onFetchPopular: async () => {
        try {
            const data = await fetchTMDB(
                `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_KEY}&language=ko-KR&page=1`
            );

            set({ popMovies: data.results || [] });
        } catch (error) {
            console.error("인기 영화 불러오기 실패:", error);
        }
    },

    // ======================================
    // 영화 영상
    // ======================================

    popVideo: {},

    onFetchVideo: async (id) => {
        if (get().popVideo[id]) {
            return get().popVideo[id];
        }

        try {
            const data = await fetchTMDB(
                `https://api.themoviedb.org/3/movie/${id}/videos?api_key=${TMDB_KEY}&language=ko-KR`
            );

            const results = data.results || [];

            set((state) => ({
                popVideo: {
                    ...state.popVideo,
                    [id]: results,
                },
            }));

            return results;
        } catch (error) {
            console.error(`영화 영상 불러오기 실패 (${id}):`, error);
            return [];
        }
    },

    // ======================================
    // 인기 TV
    // ======================================

    tvs: [],

    onFetchTv: async () => {
        try {
            const data = await fetchTMDB(
                `https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_KEY}&language=ko-KR&page=1`
            );

            set({ tvs: data.results || [] });
        } catch (error) {
            console.error("인기 TV 불러오기 실패:", error);
        }
    },

    // ======================================
    // TV 영상
    // ======================================

    tvVideo: {},

    onFetchTvVideo: async (id) => {
        if (get().tvVideo[id]) {
            return get().tvVideo[id];
        }

        try {
            const data = await fetchTMDB(
                `https://api.themoviedb.org/3/tv/${id}/videos?api_key=${TMDB_KEY}&language=ko-KR`
            );

            const results = data.results || [];

            set((state) => ({
                tvVideo: {
                    ...state.tvVideo,
                    [id]: results,
                },
            }));

            return results;
        } catch (error) {
            console.error(`TV 영상 불러오기 실패 (${id}):`, error);
            return [];
        }
    },

    // ======================================
    // TV 상세 정보 및 시즌
    // ======================================

    tvDetails: {},
    seasons: {},

    onFetchSeason: async (id) => {
        const { tvDetails, seasons } = get();

        if (tvDetails[id] && seasons[id]) {
            return tvDetails[id];
        }

        try {
            const data = await fetchTMDB(
                `https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_KEY}&language=ko-KR`
            );

            set((state) => ({
                tvDetails: {
                    ...state.tvDetails,
                    [id]: data,
                },
                seasons: {
                    ...state.seasons,
                    [id]: data.seasons || [],
                },
            }));

            return data;
        } catch (error) {
            console.error(`TV 상세 정보 불러오기 실패 (${id}):`, error);
            return null;
        }
    },

    // ======================================
    // 시즌별 에피소드
    // ======================================

    episodes: {},

    onFetchEpisode: async (id, seasonNumber) => {
        const episodeKey = `${id}-${seasonNumber}`;

        if (get().episodes[episodeKey]) {
            return get().episodes[episodeKey];
        }

        try {
            const data = await fetchTMDB(
                `https://api.themoviedb.org/3/tv/${id}/season/${seasonNumber}?api_key=${TMDB_KEY}&language=ko-KR`
            );

            const results = data.episodes || [];

            set((state) => ({
                episodes: {
                    ...state.episodes,
                    [episodeKey]: results,
                },
            }));

            return results;
        } catch (error) {
            console.error(`에피소드 불러오기 실패 (${episodeKey}):`, error);
            return [];
        }
    },

    // ======================================
    // 에피소드별 TMDB 영상
    // ======================================

    episodeVideos: {},

    onFetchEpisodeVideo: async (
        tvId,
        seasonNumber,
        episodeNumber
    ) => {
        const videoKey = `${tvId}-${seasonNumber}-${episodeNumber}`;

        if (get().episodeVideos[videoKey]) {
            return get().episodeVideos[videoKey];
        }

        try {
            const data = await fetchTMDB(
                `https://api.themoviedb.org/3/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}/videos?api_key=${TMDB_KEY}&language=en-US`
            );

            const results = data.results || [];

            set((state) => ({
                episodeVideos: {
                    ...state.episodeVideos,
                    [videoKey]: results,
                },
            }));

            return results;
        } catch (error) {
            console.error(`에피소드 영상 불러오기 실패 (${videoKey}):`, error);
            return [];
        }
    },

    // ======================================
    // YouTube 일반 영상 검색
    // ======================================

    youtubeEpisodeVideos: {},


    onSearchYoutubeEpisode: async (tvName, originalName, seasonNumber, episodeNumber) => {
        const YOUTUBE_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

        if (!YOUTUBE_KEY) {
            console.error("YouTube API 키가 없습니다.");
            return [];
        }

        const cacheKey = `${tvName}-${seasonNumber}-${episodeNumber}`;
        const cached = get().youtubeEpisodeVideos?.[cacheKey];

        if (cached) {
            return cached;
        }

        const queries = [
            `"${tvName}" ${seasonNumber}시즌 ${episodeNumber}화 -shorts -쇼츠`,
            originalName
                ? `"${originalName}" season ${seasonNumber} episode ${episodeNumber} -shorts`
                : null,
            `${tvName} ${seasonNumber}시즌 ${episodeNumber}화 공식 영상 -shorts`
        ].filter(Boolean);

        try {
            const uniqueVideos = new Map();

            for (const query of queries) {
                const searchParams = new URLSearchParams({
                    key: YOUTUBE_KEY,
                    part: "snippet",
                    q: query,
                    type: "video",
                    maxResults: "10",
                    videoEmbeddable: "true",
                    regionCode: "KR",
                    relevanceLanguage: "ko"
                });

                const searchResponse = await fetch(
                    `https://www.googleapis.com/youtube/v3/search?${searchParams}`
                );

                const searchData = await searchResponse.json();

                if (!searchResponse.ok) {
                    console.error("YouTube 검색 오류:", searchData);
                    continue;
                }

                (searchData.items || []).forEach((item) => {
                    const videoId = item.id?.videoId;
                    const title = item.snippet?.title || "";

                    if (!videoId) return;

                    // 제목에 숏츠 관련 표현이 있으면 제외
                    if (/#shorts|shorts|쇼츠/i.test(title)) return;

                    uniqueVideos.set(videoId, {
                        key: videoId,
                        title,
                        snippet: item.snippet,
                        id: { videoId }
                    });
                });

                // 후보 영상이 충분하면 추가 검색 생략
                if (uniqueVideos.size >= 10) break;
            }

            const candidates = [...uniqueVideos.values()];

            if (candidates.length === 0) {
                console.warn("검색 결과가 없습니다.");
                return [];
            }

            // 후보 영상의 실제 재생 시간 조회
            const videoIds = candidates.map((video) => video.key);

            const detailParams = new URLSearchParams({
                key: YOUTUBE_KEY,
                part: "contentDetails",
                id: videoIds.join(",")
            });

            const detailResponse = await fetch(
                `https://www.googleapis.com/youtube/v3/videos?${detailParams}`
            );

            const detailData = await detailResponse.json();

            if (!detailResponse.ok) {
                console.error("영상 길이 조회 오류:", detailData);
                return [];
            }

            const durationMap = new Map(
                (detailData.items || []).map((item) => [
                    item.id,
                    item.contentDetails?.duration
                ])
            );

            // ISO 8601 재생 시간을 초 단위로 변환
            const toSeconds = (duration = "") => {
                const match = duration.match(
                    /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/
                );

                if (!match) return 0;

                return (
                    Number(match[1] || 0) * 3600 +
                    Number(match[2] || 0) * 60 +
                    Number(match[3] || 0)
                );
            };

            // 3분 이하 영상 제외
            const normalVideos = candidates.filter((video) => {
                const duration = durationMap.get(video.key);
                return duration && toSeconds(duration) > 180;
            });

            // 긴 영상이 검색 결과에 없으면 숏츠를 대신 재생하지 않음
            const results = normalVideos.map((video) => ({
                ...video,
                duration: durationMap.get(video.key)
            }));

            set((state) => ({
                youtubeEpisodeVideos: {
                    ...state.youtubeEpisodeVideos,
                    [cacheKey]: results
                }
            }));

            console.log("일반 영상 검색 결과:", results);

            return results;
        } catch (error) {
            console.error("YouTube 영상 검색 실패:", error);
            return [];
        }
    },

}));
