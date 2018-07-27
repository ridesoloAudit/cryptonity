pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/crowdsale/validation/WhitelistedCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/validation/TimedCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/distribution/RefundableCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/distribution/PostDeliveryCrowdsale.sol";
import "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./FiatContractInterface.sol";
import "./BurnableTokenInterface.sol";

/**
 * @title CryptonityCrowdsale
 * @dev CryptonityCrowdsale
 */
// solium-disable-next-line max-len
contract CryptonityCrowdsale is TimedCrowdsale, WhitelistedCrowdsale, RefundableCrowdsale, PostDeliveryCrowdsale, Pausable {
  using SafeMath for uint256;

  // Public supply of token
  uint256 public publicSupply = 60000000 * 1 ether;
  // Remaining public supply of token for each phase
  uint256[3] public remainingPublicSupplyPerPhase = [15000000 * 1 ether, 26000000 * 1 ether, 19000000 * 1 ether];
  // Phases conditions
  uint256[3] public phasesStartTime;
  uint256[3] public phasesTokenPrices = [23, 34, 58]; // price in USD cents
  uint256[3] public phasesBonuses = [50, 30, 15]; // bonuses in percentage
  // When tokens will be available for withdraw
  uint256 deliveryTime;
  // Fiat Contract
  FiatContractInterface public fiatContract;
  // A limit for total contributions in USD cents
  uint256 public cap;

  /**
   * @param _openingTime Crowdsale opening time
   * @param _closingTime Crowdsale closing time
   * @param _secondPhaseStartTime Crowdsale second phase start time
   * @param _thirdPhaseStartTime Crowdsale third phase start time
   * @param _rate Number of token units a buyer gets per wei
   * @param _wallet Address where collected funds will be forwarded to
   * @param _token Address of the token being sold
   * @param _softCapUSDInCents Funding goal in USD cents
   * @param _hardCapUSDInCents Max amount of USD cents to be contributed
   */
  constructor(
    uint256 _openingTime,
    uint256 _closingTime,
    uint256 _secondPhaseStartTime,
    uint256 _thirdPhaseStartTime,
    uint256 _rate,
    address _wallet,
    ERC20 _token,
    uint256 _softCapUSDInCents,
    uint256 _hardCapUSDInCents,
    address _fiatContract
  )
    public
    Crowdsale(_rate, _wallet, _token)
    TimedCrowdsale(_openingTime, _closingTime)
    RefundableCrowdsale(_softCapUSDInCents)
  {
    require(_hardCapUSDInCents > 0);
    require(_softCapUSDInCents <= _hardCapUSDInCents);
    require(_secondPhaseStartTime >= _openingTime);
    require(_thirdPhaseStartTime >= _secondPhaseStartTime);
    require(_closingTime >= _thirdPhaseStartTime);
    require(_fiatContract != address(0));
    cap = _hardCapUSDInCents;
    phasesStartTime = [_openingTime, _secondPhaseStartTime, _thirdPhaseStartTime];
    // token delivery starts 15 days after the crowdsale ends
    deliveryTime = _closingTime.add(15 days);
    // fiat contract for converting USD => ETH
    fiatContract = FiatContractInterface(_fiatContract);
  }

  /**
  * @dev Set fiat contract
   * @param _fiatContract Address of new fiatContract
  */
  function setFiatContract(address _fiatContract) public onlyOwner {
    fiatContract = FiatContractInterface(_fiatContract);
  }

 /**
  * @dev Get phase number depending on the current time
  */
  function getPhaseNumber() internal view onlyWhileOpen returns (uint256) {
    if (now < phasesStartTime[1]) { // solium-disable-line security/no-block-members
      return 0;
    } else if (now < phasesStartTime[2]) { // solium-disable-line security/no-block-members
      return 1;
    } else {
      return 2;
    }
  }

  /**
  * @dev Returns the current token price in $ cents depending on the current time
  */
  function getCurrentTokenPriceInCents() public view returns (uint256) {
    return phasesTokenPrices[getPhaseNumber()];
  }

  /**
  * @dev Returns the token sale bonus percentage depending on the current time
  */
  function getCurrentBonusPercentage() public view returns (uint256) {
    return phasesBonuses[getPhaseNumber()];
  }

  /**
  * @dev Returns the current USD cent => ETH wei rate
  */
  function getCurrentUSDCentToWeiRate() internal view returns (uint256) {
    // returns $0.01 ETH wei
    return fiatContract.USD(0);
  }


  /**
  * @dev Returns the current rate depending on the current time
  */
  function _calculateCurrentRate() internal view returns (uint256) {
    return uint256(1 ether).mul(1 ether).div(getCurrentUSDCentToWeiRate()).div(getCurrentTokenPriceInCents()); // multiplier 10^18
  }

  /**
  * @dev Set the current rate
  * @param _rate New rate
  */
  function _setCurrentRate(uint256 _rate) internal {
    rate = _rate;
  }

  /**
   * @dev Checks whether the cap has been reached.
   * @return Whether the cap was reached
   */
  function capReached() public view returns (bool) {
    return weiRaised.div(getCurrentUSDCentToWeiRate()) >= cap;
  }

  /**
   * @dev Checks whether funding goal was reached.
   * @return Whether funding goal was reached
   */
  function goalReached() public view returns (bool) {
    return weiRaised.div(getCurrentUSDCentToWeiRate()) >= goal;
  }

  /**
   * @dev Validation of an incoming purchase. Allowas purchases only when crowdsale is not paused.
   * @param _beneficiary Address performing the token purchase
   * @param _weiAmount Value in wei involved in the purchase
   */
  function _preValidatePurchase(address _beneficiary, uint256 _weiAmount) internal whenNotPaused {
    super._preValidatePurchase(_beneficiary, _weiAmount);
    // update current rate according to the USD/ETH rate
    _setCurrentRate(_calculateCurrentRate());
    require(weiRaised.add(_weiAmount).div(getCurrentUSDCentToWeiRate()) <= cap);
  }

  /**
   * @dev The way in which ether is converted to tokens.
   * @param _weiAmount Value in wei to be converted into tokens
   * @return Number of tokens that can be purchased with the specified _weiAmount
   */
  function _getTokenAmount(uint256 _weiAmount)
    internal view returns (uint256)
  {
    return _weiAmount.mul(rate).div(1 ether); // multiplier 10^18
  }

  /**
   * @dev Executed when a purchase has been validated and is ready to be executed. Not necessarily emits/sends tokens.
   * It computes the bonus.
   * @param _beneficiary Address receiving the tokens
   * @param _tokenAmount Number of tokens to be purchased
   */
  function _processPurchase(address _beneficiary, uint256 _tokenAmount) internal {
    uint256 totalAmount = _tokenAmount;
    uint256 bonusPercent = getCurrentBonusPercentage();

    if (bonusPercent > 0) {
      uint256 bonusAmount = totalAmount.mul(bonusPercent).div(100); // tokens * bonus (%) / 100%
      totalAmount = totalAmount.add(bonusAmount);
    }
    uint256 phaseNumber = getPhaseNumber();
    require(remainingPublicSupplyPerPhase[phaseNumber] > totalAmount);
    super._processPurchase(_beneficiary, totalAmount);
    remainingPublicSupplyPerPhase[phaseNumber] = remainingPublicSupplyPerPhase[phaseNumber].sub(totalAmount);
  }

  /**
  * @dev Withdraw tokens only after the deliveryTime
  */
  function withdrawTokens() public {
    require(goalReached());
    // solium-disable-next-line security/no-block-members
    require(now > deliveryTime);
    super.withdrawTokens();
  }

  /**
   * @dev Finalization logic.
   * Burn the remaining tokens.
   * Transfer token ownership to contract owner.
   */
  function finalization() internal {
    super.finalization();
    uint256 totalRemainingPublicSupply = 0;
    for (uint i = 0; i < remainingPublicSupplyPerPhase.length; i++) {
      totalRemainingPublicSupply = totalRemainingPublicSupply.add(remainingPublicSupplyPerPhase[i]);
    }
    if (totalRemainingPublicSupply > 0) {
      BurnableTokenInterface(address(token)).burn(totalRemainingPublicSupply);
      delete remainingPublicSupplyPerPhase;
    }
    Ownable(address(token)).transferOwnership(owner);
  }

}