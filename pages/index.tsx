import {
  none,
  PublicKey,
  publicKey,
  Umi,
} from "@metaplex-foundation/umi";
import { DigitalAssetWithToken, JsonMetadata } from "@metaplex-foundation/mpl-token-metadata";
import dynamic from "next/dynamic";
import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";
import { useUmi } from "../utils/useUmi";
import { fetchCandyMachine, safeFetchCandyGuard, CandyGuard, CandyMachine, AccountVersion } from "@metaplex-foundation/mpl-candy-machine"
import styles from "../styles/Home.module.css";
import { guardChecker } from "../utils/checkAllowed";
import { Center, Card, CardHeader, CardBody, StackDivider, Heading, Stack, useToast, Text, Skeleton, useDisclosure, Button, Modal, ModalBody, ModalCloseButton, ModalContent, Image, ModalHeader, ModalOverlay, Box, Divider, VStack, Flex } from '@chakra-ui/react';
import { ButtonList } from "../components/mintButton";
import { GuardReturn } from "../utils/checkerHelper";
import { ShowNft } from "../components/showNft";
import { InitializeModal } from "../components/initializeModal";
import { headerText } from "../settings";
import dogImage from '../public/dog.png';
import { useSolanaTime } from "@/utils/SolanaTimeContext";




const WalletMultiButtonDynamic = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const useCandyMachine = (
  umi: Umi,
  candyMachineId: string,
  checkEligibility: boolean,
  setCheckEligibility: Dispatch<SetStateAction<boolean>>,
  firstRun: boolean,
  setfirstRun: Dispatch<SetStateAction<boolean>>
) => {
  const [candyMachine, setCandyMachine] = useState<CandyMachine>();
  const [candyGuard, setCandyGuard] = useState<CandyGuard>();
  const toast = useToast();


  useEffect(() => {
    (async () => {
      if (checkEligibility) {
        if (!candyMachineId) {
          console.error("No candy machine in .env!");
          if (!toast.isActive("no-cm")) {
            toast({
              id: "no-cm",
              title: "No candy machine in .env!",
              description: "Add your candy machine address to the .env file!",
              status: "error",
              duration: 999999,
              isClosable: true,
            });
          }
          return;
        }

        let candyMachine;
        try {
          candyMachine = await fetchCandyMachine(umi, publicKey(candyMachineId));
          //verify CM Version
          if (candyMachine.version != AccountVersion.V2){
            toast({
              id: "wrong-account-version",
              title: "Wrong candy machine account version!",
              description: "Please use latest sugar to create your candy machine. Need Account Version 2!",
              status: "error",
              duration: 999999,
              isClosable: true,
            });
            return;
          }
        } catch (e) {
          console.error(e);
          toast({
            id: "no-cm-found",
            title: "The CM from .env is invalid",
            description: "Are you using the correct environment?",
            status: "error",
            duration: 999999,
            isClosable: true,
          });
        }
        setCandyMachine(candyMachine);
        if (!candyMachine) {
          return;
        }
        let candyGuard;
        try {
          candyGuard = await safeFetchCandyGuard(umi, candyMachine.mintAuthority);
        } catch (e) {
          console.error(e);
          toast({
            id: "no-guard-found",
            title: "No Candy Guard found!",
            description: "Do you have one assigned?",
            status: "error",
            duration: 999999,
            isClosable: true,
          });
        }
        if (!candyGuard) {
          return;
        }
        setCandyGuard(candyGuard);
        if (firstRun){
          setfirstRun(false)
        }
      }
    })();
  }, [umi, checkEligibility]);

  return { candyMachine, candyGuard };


};


export default function Home() {
  const umi = useUmi();
  const solanaTime = useSolanaTime();
  const toast = useToast();
  const { isOpen: isShowNftOpen, onOpen: onShowNftOpen, onClose: onShowNftClose } = useDisclosure();
  const { isOpen: isInitializerOpen, onOpen: onInitializerOpen, onClose: onInitializerClose } = useDisclosure();
  const [mintsCreated, setMintsCreated] = useState<{ mint: PublicKey, offChainMetadata: JsonMetadata | undefined }[] | undefined>();
  const [isAllowed, setIsAllowed] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [ownedTokens, setOwnedTokens] = useState<DigitalAssetWithToken[]>();
  const [guards, setGuards] = useState<GuardReturn[]>([
    { label: "startDefault", allowed: false, maxAmount: 0 },
  ]);
  const [firstRun, setFirstRun] = useState(true);
  const [checkEligibility, setCheckEligibility] = useState<boolean>(true);


  if (!process.env.NEXT_PUBLIC_CANDY_MACHINE_ID) {
    console.error("No candy machine in .env!")
    if (!toast.isActive('no-cm')) {
      toast({
        id: 'no-cm',
        title: 'No candy machine in .env!',
        description: "Add your candy machine address to the .env file!",
        status: 'error',
        duration: 999999,
        isClosable: true,
      })
    }
  }
  const candyMachineId: PublicKey = useMemo(() => {
    if (process.env.NEXT_PUBLIC_CANDY_MACHINE_ID) {
      return publicKey(process.env.NEXT_PUBLIC_CANDY_MACHINE_ID);
    } else {
      console.error(`NO CANDY MACHINE IN .env FILE DEFINED!`);
      toast({
        id: 'no-cm',
        title: 'No candy machine in .env!',
        description: "Add your candy machine address to the .env file!",
        status: 'error',
        duration: 999999,
        isClosable: true,
      })
      return publicKey("11111111111111111111111111111111");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { candyMachine, candyGuard } = useCandyMachine(umi, candyMachineId, checkEligibility, setCheckEligibility, firstRun, setFirstRun);

  useEffect(() => {
    const checkEligibilityFunc = async () => {
      if (!candyMachine || !candyGuard || !checkEligibility || isShowNftOpen) {
        return;
      }
      setFirstRun(false);
      
      const { guardReturn, ownedTokens } = await guardChecker(
        umi, candyGuard, candyMachine, solanaTime
      );

      setOwnedTokens(ownedTokens);
      setGuards(guardReturn);
      setIsAllowed(false);

      let allowed = false;
      for (const guard of guardReturn) {
        if (guard.allowed) {
          allowed = true;
          break;
        }
      }

      setIsAllowed(allowed);
      setLoading(false);
    };

    checkEligibilityFunc();
    // On purpose: not check for candyMachine, candyGuard, solanaTime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [umi, checkEligibility, firstRun]);

  const [count, setCount] = useState(1);

  const PageContent = () => {
    return (
      <>
        <style jsx global>
          {`
        @media screen and (min-width: 1024px) and (max-width: 2560px) { 
          body {
            background: url(/bg.png);
            background-position: center;
            background-size: 110%;
            background-position-y: 5%;
            background-position-x: center;
        }
         }

      
    @media screen and (min-width: 360px) and (max-width: 840px) { 
     body {
      height: 100vh;
      background: url(/bg.png);
      background-position: center;
      background-repeat: no-repeat;
      background-position-y: 96%;
      background-position-x: center;
      background-size: cover;
     }
     }
    }
    
    
       }
   `}
        </style>
        <Card backgroundColor="#" className={styles.bigcontainer}  >
          {/* <CardHeader>
            <Flex minWidth='max-content' alignItems='center' gap='2'>
              <Box>
                <Heading size='md'>{headerText}</Heading>
              </Box>
              {loading ? (<></>) : (
                <Flex justifyContent="flex-end" marginLeft="auto">
                  <Box background={"#b39ddb"} borderRadius={"5px"} minWidth={"50px"} minHeight={"50px"} p={2} >
                    <VStack >
                      <Text fontSize={"sm"}>Available NFTs:</Text>
                      <Text fontWeight={"semibold"}>{Number(candyMachine?.data.itemsAvailable) - Number(candyMachine?.itemsRedeemed)}/{Number(candyMachine?.data.itemsAvailable)}</Text>
                    </VStack>
                  </Box>
                </Flex>
              )}
            </Flex>
          </CardHeader> */}

          <CardBody >
            <div className={styles.container} color={"white"} >
              <h1 style={{ fontWeight: 'bold', fontSize: '34px', color: 'white', marginTop:"-31px", } } 
              className={`${styles.title} ${styles.mobile_title}`}>
                Mia the Spitz | Alpha NFT
              </h1>
              <Box
                // rounded={'lg'}
                className={styles.image_container}
                >
                <Image
                  className={styles.image}
                  //rounded={'lg'}
                  alt={"project Image"}
                  src={'/dog.png'}  
                  sizes="(max-width: 1440px) 300px,"
                />
              </Box>
              <div /*style={{ marginLeft: '25px', color: 'white', marginTop: "20px" }}*/  className = {styles.text_wrapper}>

              <h1 style={{ fontWeight: 'bold', fontSize: '34px', color: 'white', marginTop:"-31px", } }
                  className={styles.title}
                  >Mia the Spitz | Alpha NFT</h1>
              <br/>
              <p style={{ fontSize: '16px' }} 
                  className={styles.paragraph}
                  >NFT collection of 444 Spitzes! This is alpha NFT collection, which will give access to our closed alpha-community, giveaways, drops and will provide bonuses in our Play2earn project.</p>
              <div className="tdiv">
              <h3 className={styles.progress}>Mint Process</h3>
              <ul className={styles.lists} >
                <li className={styles.txt}>Free Mint + GTD Mint</li>
                <li className={styles.txt}>FCFS Mint</li>
                <li className={styles.txt}>Public Mint</li>
              </ul>
              <ul className={`${styles.lists} ${styles.hours_list}`}>
                <li className={styles.list_hour_1}><p className={styles.txt}>4h</p>
                  <Image className={styles.listsimg} src = "/check.png"  />
                </li>
                <li className={styles.list_hour_2}><p className={styles.txt}>4h</p><Image objectFit={'cover'} className={styles.listsimg1} src = "/upnext.png" /></li>
                <li className={styles.list_hour_3}><p className={styles.txt}>8h</p></li>
              </ul>
              </div>
              {/* <button className={styles.buttonNFT}>Mint&emsp;&lt;NFT&gt;</button> */}
              <Button className={styles.buttonNFT}>
                  Mint&emsp;
                  <span onClick={()=>setCount(count - 1)} className={styles.arrow_button}>&lt;</span> 
                  &nbsp;{count} NFT&nbsp;
                  <span onClick={()=>setCount(count + 1)} className={styles.arrow_button}>&gt;</span>
              </Button>
              <Stack spacing='5' color="white" flexDirection={"row-reverse"} flexWrap={"wrap"} width={"33vw"} marginLeft={"16rem"} 
              className={styles.mintt}>
              {loading ? (
                <div>
                  <Divider my="10px" />
                  <Skeleton height="30px" my="10px" />
                  <Skeleton height="30px" my="10px" />
                  <Skeleton height="30px" my="10px" />
                </div>
              ) : (
                <ButtonList
                  guardList={guards}
                  candyMachine={candyMachine}
                  candyGuard={candyGuard}
                  umi={umi}
                  ownedTokens={ownedTokens}
                  setGuardList={setGuards}
                  mintsCreated={mintsCreated}
                  setMintsCreated={setMintsCreated}
                  onOpen={onShowNftOpen}
                  setCheckEligibility={setCheckEligibility}
                />
              )}
            </Stack>
          </div>

            </div>

            
            
          </CardBody>
        </Card >
        {umi.identity.publicKey === candyMachine?.authority ? (
          <>
            <Center>
              <Button backgroundColor={"red.200"} marginTop={"10"} onClick={onInitializerOpen}>Initialize Everything!</Button>
            </Center>
            <Modal isOpen={isInitializerOpen} onClose={onInitializerClose}>
              <ModalOverlay />
              <ModalContent maxW="600px">
                <ModalHeader>Initializer</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                  < InitializeModal umi={umi} candyMachine={candyMachine} candyGuard={candyGuard} />
                </ModalBody>
              </ModalContent>
            </Modal>

          </>)
          :
          (<></>)
        }

        <Modal isOpen={isShowNftOpen} onClose={onShowNftClose}>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>Your minted NFT:</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <ShowNft nfts={mintsCreated} />
            </ModalBody>
          </ModalContent>
        </Modal>
      </>
    );
      };

  return (
    <main>
      <div className={styles.wallet}>
        <WalletMultiButtonDynamic />
      </div>

      <div className={styles.center}>
        <PageContent key="content" />
      </div>
    </main>
  );
}


