
import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase/Firebase";
import firebase from "firebase/compat/app";

export const useHeartStore = create((set, get) => ({
    // 찜리스트를 저장할 배열
    hearts: [],

    // 찜하기 및 찜 취소
    onToggleHearts: async (item) => {
        const user = auth.currentUser;
        console.log(user);
        if (!user) return;

        const currentMember = useAuthStore.getState().currentMember;
        console.log("선택멤버", currentMember);
        if (!currentMember) return;

        try {
            const heartItem = {
                id: item.id,
                // 영화는 title, TV는 name 사용
                title: "title" in item ? item.title : item.name,
                poster_path: item.poster_path,
            };

            // Firebase 사용자 문서 가져오기
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                // 기존 찜 목록
                const prevHeart =
                    userDoc.data()?.familyMembers?.[currentMember]?.likes || [];

                // 이미 찜한 항목인지 확인
                const isHearted = prevHeart.some(
                    (h) => String(h.id) === String(item.id)
                );

                // 찜한 항목이면 삭제, 아니면 추가
                const newHeart = isHearted
                    ? prevHeart.filter(
                        (h) => String(h.id) !== String(item.id)
                    )
                    : [heartItem, ...prevHeart];

                // Firebase 업데이트
                await updateDoc(userDocRef, {
                    [`familyMembers.${currentMember}.likes`]: newHeart,
                });

                // Zustand 상태 업데이트
                set({ hearts: newHeart });

                console.log("변경된 찜 목록", get().hearts);
            }
        } catch (err) {
            console.log("찜 오류", err.message);
        }
    },

    // 저장된 찜리스트 불러오기
    onLoadHearts: async () => {
        const user = auth.currentUser;
        if (!user) return;

        const currentMember = useAuthStore.getState().currentMember;
        if (!currentMember) return;

        try {
            // Firebase 사용자 계정
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const likes =
                    userDoc.data()?.familyMembers?.[currentMember]?.likes || [];

                set({ hearts: likes });
            }
        } catch (err) {
            console.log("찜리스트 불러오기 오류", err);
        }
    },

    // 찜 삭제
    onRemoveHearts: async (id) => {
        const user = auth.currentUser;
        if (!user) return;

        const currentMember = useAuthStore.getState().currentMember;
        if (!currentMember) return;

        try {
            // Firebase 사용자 계정
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const likes =
                    userDoc.data()?.familyMembers?.[currentMember]?.likes || [];

                const filtered = likes.filter(
                    (h) => String(h.id) !== String(id)
                );

                await updateDoc(userDocRef, {
                    [`familyMembers.${currentMember}.likes`]: filtered,
                });

                set({ hearts: filtered });
                alert("찜삭제");
            }
        } catch (err) {
            console.log("찜삭제 오류", err);
        }
    },

    // 하트 상태 확인
    onIsHeart: (id) => {
        console.log("선택아이디", id);

        return get().hearts.some(
            (h) => String(h.id) === String(id)
        );
    },
}));
